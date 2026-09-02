import crypto from "crypto";
import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { sanitizeCleanText } from "./src/lib/textSanitizer";
import { wrapUntrusted } from "./src/lib/untrustedContent";
import { mergeKpiPanel, normalizeChart, parseScorecardsPayload } from "./src/lib/reportParser";
import {
  MAX_CONTEXT_CHARS,
  MAX_EXAMPLE_INPUT_CHARS,
  MAX_EXAMPLE_OUTPUT_CHARS,
  MAX_EXAMPLES,
  MAX_INPUT_CHARS,
  MAX_JSON_BYTES,
  MAX_SCREENSHOTS,
  MAX_SCREENSHOT_CHARS,
} from "./src/lib/payloadLimits";

dotenv.config({ path: ".env.local" });
dotenv.config();

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function sessionSecret(): string {
  return process.env.APP_SESSION_SECRET || process.env.GEMINI_API_KEY || "dev-insecure-session";
}

function signSessionId(id: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(id).digest("hex");
}

function generateSessionToken(): string {
  const id = crypto.randomBytes(16).toString("hex");
  return `${id}.${signSessionId(id)}`;
}

function issueSessionCookie(res: express.Response): string {
  const value = generateSessionToken();
  // AI Studio preview corre en iframe cross-origin. SameSite=None; Secure es necesario en navegadores modernos.
  res.setHeader(
    "Set-Cookie",
    `santander_sid=${value}; HttpOnly; SameSite=None; Secure; Partitioned; Path=/; Max-Age=86400`
  );
  return value;
}

function isValidSessionToken(token?: string | null): boolean {
  if (!token) return false;
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const expected = signSessionId(id);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function getRequestSessionToken(req: express.Request): string | undefined {
  const headerToken = req.headers["x-session-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return parseCookies(req.headers.cookie).santander_sid;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function allowRate(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function isTrustedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === "ai.studio" || host.endsWith(".ai.studio")) return true;
  if (host === "aistudio.google.com" || host.endsWith(".aistudio.google.com")) return true;
  if (host.endsWith(".googleusercontent.com")) return true;
  if (host.endsWith(".run.app")) return true;
  if (host.endsWith(".cloudworkstations.dev")) return true;
  if (host.endsWith(".appspot.com")) return true;
  return false;
}

function originAllowed(req: express.Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = req.headers.host;
    if (host && u.host === host) return true;
    if (isTrustedHostname(u.hostname)) return true;
    if (process.env.APP_URL) {
      const allowed = new URL(process.env.APP_URL);
      if (u.host === allowed.host) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function requireAgentSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!originAllowed(req)) {
    return res.status(403).json({ error: "Origen no permitido." });
  }
  const token = getRequestSessionToken(req);
  if (!isValidSessionToken(token)) {
    return res.status(401).json({ error: "Sesión inválida o expirada. Recargá la página." });
  }
  next();
}

function isRetryableGeminiError(err: unknown): boolean {
  const anyErr = err as { message?: string; status?: number; code?: number };
  const msg = String(anyErr?.message || err || "");
  const code = anyErr?.status || anyErr?.code;
  return code === 429 || code === 503 || /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(msg);
}

function userFacingGeminiError(err: unknown): string {
  const msg = String((err as { message?: string })?.message || err || "");
  if (/GEMINI_API_KEY no configurado/i.test(msg) || !process.env.GEMINI_API_KEY) {
    return "Falta configurar GEMINI_API_KEY en los secretos del proyecto (Settings > Secrets > Apply changes).";
  }
  if (/API_KEY_INVALID|API key not valid/i.test(msg)) {
    return "La API Key de Gemini ingresada no es válida. Verificala en Google AI Studio > Settings > Secrets.";
  }
  if (/RESOURCE_EXHAUSTED|quota exceeded|429/i.test(msg)) {
    return "Se agotó temporalmente la cuota de peticiones por minuto (429 Rate Limit) de Gemini. Esperá 60 segundos antes de reintentar.";
  }
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return "Los servidores de Gemini están saturados en este momento (503 High Demand). Reintentá en un minuto o seleccioná gemini-2.5-flash.";
  }
  // Devolver el mensaje real para poder diagnosticar inmediatamente
  const clean = msg.replace(/at\s+[\w./\\-]+/g, "").slice(0, 300).trim();
  return clean || "Error al comunicarse con la API de Gemini. Reintentá en unos instantes.";
}

const PUBLIC_ERROR = "No se pudo completar la solicitud. Reintentá en unos minutos.";

const app = express();
const PORT = 3000;

const kpiSectionEnum = {
  type: Type.STRING,
  description: "Sección del one-pager: 'trafico' | 'medios' | 'producto' | 'general'."
};

const generarGraficoDeclaration = {
  name: "generarGrafico",
  description: "Registra UN gráfico (misma unidad en todas las barras). Llamá una vez por desglose: mix de canal de una landing, funnel de un flujo, etc. No mezcles sesiones con CTR ni $ con impresiones.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "Título del gráfico (incluye la landing o flujo)." },
      type: { type: Type.STRING, description: "'bar' | 'line' | 'pie'." },
      section: kpiSectionEnum,
      unit: { type: Type.STRING, description: "Unidad única del eje (sesiones, usuarios, citas, impresiones)." },
      data: {
        type: Type.ARRAY,
        description: "Series name/value con la misma unidad.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Canal, paso o fecha." },
            value: { type: Type.NUMBER, description: "Valor numérico." }
          },
          required: ["name", "value"]
        }
      }
    },
    required: ["title", "type", "data"]
  }
};

const generarScorecardsDeclaration = {
  name: "generarScorecards",
  description: "Registra las cajas KPI del one-pager (totales de tráfico, paid media y producto). Una sola llamada con todas las tarjetas presentes en el input. No inventes TBD ni cifras ausentes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      scorecards: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            section: kpiSectionEnum,
            label: { type: Type.STRING, description: "Nombre de la caja (ej. Tráfico landing ATR)." },
            valueLabel: { type: Type.STRING, description: "Cifra tal como se reporta (ej. 216.2 K)." },
            numericValue: { type: Type.NUMBER, description: "Valor numérico si se puede parsear." },
            unit: { type: Type.STRING, description: "sesiones, citas, %, MXN, etc." },
            delta: { type: Type.STRING, description: "Variación vs periodo si está en el input." },
            note: { type: Type.STRING, description: "Fuente o matiz breve." }
          },
          required: ["section", "label", "valueLabel"]
        }
      }
    },
    required: ["scorecards"]
  }
};

const agentTools = [
  { functionDeclarations: [generarGraficoDeclaration, generarScorecardsDeclaration] }
];

function verticalVizHints(category: string): string {
  const common = `PANEL KPI (OBLIGATORIO SI HAY NÚMEROS):
- Llamá generarScorecards UNA vez con todas las cajas de totales (como el PPT).
- Llamá generarGrafico UNA vez por cada mix/desglose de la MISMA unidad (máx. 8 gráficos).
- section: trafico | medios | producto | general.
- Si una cifra es TBD o no está, omitila. No inventes.`;

  const byVertical: Record<string, string> = {
    cards: `${common}
CARDS — scorecards típicos:
- trafico: total sesiones por landing/hub (Promociones, Días Santander, TyC, Conoce más).
- medios: impresiones, clics, CTR, VTR/views, inversión vs plan, sesiones paid (si están).
- Gráficos: mix de canal (sesiones) POR landing, no mezclar landings ni CTR con impresiones.`,
    nomina: `${common}
NÓMINA — scorecards típicos:
- producto/general: solicitudes Porta In, cancelaciones Porta Out, CR paso 1→solicitud/cancelación, solicitudes paid.
- trafico: usuarios Paso 1 Porta In, Paso 1 Porta Out, sesiones LP Portabilidad si están.
- medios: impresiones, completed views, sesiones LP, CPA/CR paid si están (cajas aparte, no en el mismo gráfico que usuarios).
- Gráficos: mix orgánico/paid/comunicación directa de Paso 1 (usuarios) y, aparte, mix de solicitudes. Un gráfico por flujo (In vs Out).`,
    pymes: `${common}
PYMES — scorecards típicos:
- producto/general: citas agendadas, contacto segmento empresarial, % citas paid.
- trafico: sesiones landing ATR, sesiones agendador.
- medios: mix paid (Google/Meta/TikTok/Influencers) solo con cifras reales; omitir TBD.
- Gráficos: mix de canal de ATR (sesiones), mix de agendador (sesiones), mix de citas (citas). No mezclar sesiones con citas.`,
    institucional: `${common}
INSTITUCIONAL — scorecards: reach, frecuencia/OTS, eCPM, inversión, views, tráfico home si están.
Gráficos: mix de cobertura o evolución temporal con una sola unidad por gráfico.`,
    general: `${common}
Inferí secciones del input (tráfico, medios, producto).`
  };

  return byVertical[category] || byVertical.general;
}

// Helper para bucle de agentes autónomos con soporte para Function Calling real y tolerancia a fallas por alta demanda (503)
async function runGeminiWithTools(
  ai: GoogleGenAI,
  initialModel: string,
  contents: any[],
  systemInstruction: string,
  tools: any[]
): Promise<{ text: string; registeredPanel: ReturnType<typeof mergeKpiPanel> }> {
  let currentContents = [...contents];
  const registeredCharts: any[] = [];
  const registeredScorecards: any[] = [];
  
  // Lista ordenada de modelos para fallback resiliente si el principal se encuentra saturado (503 / High Demand)
  const candidateModels = [initialModel, "gemini-2.5-flash", "gemini-flash-latest", "gemini-3.7-flash"];
  const fallbackModels = Array.from(new Set(candidateModels.filter(Boolean)));
  
  // Soporta hasta 4 turnos recursivos entre el modelo y la ejecución de tools locales en bucle autónomo
  for (let turn = 0; turn < 4; turn++) {
    let response: any = null;
    let success = false;
    let lastError: any = null;

    // Bucle de resiliencia de modelos
    for (const currentModel of fallbackModels) {
      try {
        console.log(`[Bucle Agente] Intentando generateContent con modelo: ${currentModel} (Turno ${turn + 1})`);
        const genConfig: any = {
          systemInstruction,
          temperature: turn === 0 ? 0.2 : 0.1,
        };
        if (tools && tools.length > 0) {
          genConfig.tools = tools;
        }
        response = await ai.models.generateContent({
          model: currentModel,
          contents: currentContents,
          config: genConfig,
        });
        success = true;
        break; // Éxito, salir de los fallbacks de modelos
      } catch (err: any) {
        lastError = err;
        console.warn(`[Servidor Fallback Warning] El modelo ${currentModel} falló. Error: ${err.message || err}.`);
        if (!isRetryableGeminiError(err)) {
          // Si falló por configuración de tools, intentamos fallback sin tools en el siguiente modelo
          continue;
        }
      }
    }

    if (!success || !response) {
      throw new Error(`Todos los modelos de la API de Gemini fallaron o se encuentran temporalmente saturados. Último error: ${lastError?.message || lastError}`);
    }

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      console.log(`[Bucle Agente Turno ${turn + 1}] Ejecución de herramienta:`, functionCalls);
      
      const modelTurnContent = response.candidates?.[0]?.content;
      if (modelTurnContent) {
        currentContents.push(modelTurnContent);
      }

      const toolResponseParts: any[] = [];

      for (const call of functionCalls) {
        let result: any = null;
        
        if (call.name === "generarGrafico") {
          const chart = normalizeChart(call.args || {});
          if (chart) {
            if (registeredCharts.length < 8) registeredCharts.push(chart);
            result = {
              success: true,
              status: `Gráfico registrado (${registeredCharts.length}/8). Podés invocar generarGrafico de nuevo para otro desglose de la misma unidad.`,
              registeredPayload: chart
            };
          } else {
            result = {
              success: false,
              error: "Payload de gráfico inválido. Usá type bar|line|pie, section, unit y data[{name,value}] con una sola unidad."
            };
          }
        } else if (call.name === "generarScorecards") {
          const cards = parseScorecardsPayload(call.args || {});
          if (cards.length > 0) {
            registeredScorecards.push(...cards);
            result = {
              success: true,
              status: `${cards.length} scorecards registrados.`,
              count: cards.length
            };
          } else {
            result = {
              success: false,
              error: "Scorecards inválidos. Cada item necesita section, label y valueLabel."
            };
          }
        } else {
          result = { success: false, error: "Herramienta no permitida." };
        }

        toolResponseParts.push({
          functionResponse: {
            name: call.name,
            response: result,
            id: call.id
          }
        });
      }

      currentContents.push({
        role: "user",
        parts: toolResponseParts
      });

    } else {
      // Si ya no pide herramientas, este es el output final de texto
      return {
        text: response.text || "",
        registeredPanel: mergeKpiPanel(registeredScorecards, registeredCharts)
      };
    }
  }

  // Fallback si superó el número de turnos
  let finalFallback: any = null;
  let fallbackSuccess = false;
  let finalFallbackError: any = null;

  for (const currentModel of fallbackModels) {
    try {
      finalFallback = await ai.models.generateContent({
        model: currentModel,
        contents: currentContents,
        config: { systemInstruction, temperature: 0.2 }
      });
      fallbackSuccess = true;
      break;
    } catch (err: any) {
      finalFallbackError = err;
      console.warn(`[Servidor Fallback Warning] El modelo ${currentModel} falló en el retorno del fallback final. Error: ${err.message || err}`);
      if (!isRetryableGeminiError(err)) break;
    }
  }

  if (!fallbackSuccess || !finalFallback) {
    throw new Error(`El procesador de fallback final falló debido a inestabilidad en el servicio de Gemini. Último error: ${finalFallbackError?.message || finalFallbackError}`);
  }

  return {
    text: finalFallback.text || "",
    registeredPanel: mergeKpiPanel(registeredScorecards, registeredCharts)
  };
}

// Middleware
app.use(express.json({ limit: MAX_JSON_BYTES }));
app.use(express.urlencoded({ limit: MAX_JSON_BYTES, extended: true }));

// Lazy-initialized Gemini Client (refreshes if GEMINI_API_KEY changes)
let cachedKey: string | null = null;
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY no configurado en el servidor. Dirigite a Settings > Secrets para cargarlo.");
  }
  if (!aiClient || cachedKey !== key) {
    cachedKey = key;
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

// System instructions for the Senior Media.Monks Santander Agent
const SYSTEM_INSTRUCTION = `Sos el "Agente Santander", un IA Agent de nivel Senior especializado en Data & Performance de Media.Monks para Santander México.

TU MISIÓN:
Transformar raw data (BigQuery, AppsFlyer, Looker, capturas de pantalla, planillas) en insights ejecutivos de alto impacto y actuar como consultor técnico.

REGLA DE SEGURIDAD Y ENFOQUE DE NEGOCIO (ESTRICTA):
- Queda prohibido responder a preguntas explícitas o entablar diálogos sobre asuntos que NO correspondan a campañas de marketing, analítica digital o soporte técnico (por ejemplo: preferencias de comida rápida, películas, temas personales, política, etc.).
- Si el usuario te realiza una pregunta explícita ajena a este ámbito, responde únicamente:
  "Como tu Agente especializado de Performance para Santander México, solo puedo asistir con métricas de campaña y consultas técnicas relacionadas a la cuenta de Santander."
- IMPORTANTE: Ante archivos cargados, tablas o textos con métricas de campaña o nombres de archivos de campaña (ej: PPTX, Excel, Pymes, Cards, Nómina, etc.), SIEMPRE analízalos y procesa el reporte de performance. Si un archivo o texto viene con muy poco contenido o vacío, explica constructivamente que no se detectaron métricas suficientes en el archivo en vez de emitir el mensaje de rechazo de negocio.

GUARDRAIL DE VERIFICACIÓN NUMÉRICA AUTOMÁTICA (ESTRICTO):
- Realiza una auditoría previa de las cifras reportadas. Si el input contiene desgloses porcentuales por canal de medios o campañas (share %), VERIFICA obligatoriamente que la suma de las participaciones cierre en exactamente el 100%. Si hay un pequeño redondeo o imprecisión en el texto original (ej: 99.8% o 102.4%), realiza el recálculo matemático de normalización al 100.0% e indícalo en el análisis.
- Verifica matemáticamente la coherencia entre Inversión, Conversiones, Clics, CTR (Clics/Impresiones*100) y CPA (Inversión/Conversiones). Nunca reproduzcas errores de cálculo de la fuente sin advertirlos o corregirlos.

PROTOCOLO DE RAZONAMIENTO CONTRACTUAL (MANDATORIO):
Debes envolver tu pensamiento en etiquetas XML <thinking_steps> siguiendo el modelo ReAct (Thought, Action, Observation):
- Thought: Análisis profundo del pedido, identificación de variables clave, o cruzamiento con el Account Context.
- Action: Qué herramientas o datos estás auditando (ej: "Consultando base de normativas de la cuenta", "Analizando consistencia de clics vs descargas en las imágenes").
- Observation: Qué anomalías u observaciones numéricas encontraste.

Formato:
<thinking_steps>
Thought: [Análisis analítico]
Action: [Acción de auditoría]
Observation: [Anomalía o patrón numérico hallado en RAG]
</thinking_steps>

REGLA DE SOBRIEDAD Y TRATO (ESTRICTA - PROHIBIDO NOMBRES PROPIOS):
- Queda ESTRICTAMENTE PROHIBIDO mencionar o dirigirte a personas utilizando nombres propios (por ejemplo: 'Nico', 'Nicolás', 'Juan', o cualquier otro nombre propio) en NINGÚN reporte, alerta de riesgo, saludo, resumen, viñeta o respuesta de diálogo.
- Refiérete siempre de forma impersonal, ejecutiva, profesional y neutral ("el equipo", "el equipo de Performance", "la dirección", o en segunda persona formal/neutra).

DETECCIÓN DE RIESGOS (Function Calling Simulator):
- Si hay un desvío de métricas > 20% o discrepancia severa, escribe ÚNICAMENTE UNA VEZ en una línea al final: [[ALERTA_DE_RIESGO]] seguido de una explicación sumamente ejecutiva para el equipo (sin mencionar nombres propios). Nunca repitas la etiqueta.

GENERACIÓN DE PANEL KPI (scorecards + gráficos):
- Si hay métricas, invocá generarScorecards (cajas de totales por sección) y generarGrafico (un gráfico por desglose, misma unidad).
- No escribas XML/JSON de gráficos en el texto. No mezcles unidades en un mismo gráfico.

MODOS DE OPERACIÓN:

1. GENERADOR DE ONE PAGERS:
   - Estructura Mandatoria de Secciones Adaptativa por Producto/Vertical:
     # 1. RESUMEN EJECUTIVO
     # 2. KEY INSIGHTS (BASADOS EN DATOS)
        ## Highlights Generales
        - Insights macro, objetivos de negocio y rendimiento global.
        ## [SECCIÓN DE PRODUCTO ESPECÍFICA] (e.g., 'Adquisición' para Pymes, 'Portabilidad y Preclas' para Nómina, 'Aprobaciones y Colocación TDC' para Cards, 'Reach y Frecuencia' para Institucional)
        - Insights dedicados al producto/vertical identificados en los documentos o requeridos por el negocio.
        ## Análisis de Tráfico
        - Insights de comportamiento de tráfico, sesiones, usuarios únicos e interacción.
        ## Medios
        - Insights por canal (Paid Media, Search, Social, Display, Influencers, etc.), inversión, CPA, CPI, CTR y eficiencia.
     # 3. PRÓXIMAS ACCIONES (NEXT STEPS)
   - Obligatorio: Datos numéricos exactos, variaciones % y análisis alineado a las secciones de cada producto.

2. SOPORTE TÉCNICO & CONSULTA:
   - Basate en el material de referencia y en mejores prácticas.

REGLA DE ORO:
- No alucines cifras. Si falta data, indicalo proactivamente.`;

// RAG Focus: Dynamic Context Segmentation by Vertical
const VERTICAL_KEYWORDS: Record<string, { strong: string[]; weak: string[] }> = {
  cards: {
    strong: ["tdc", "tdd", "likeu", "fiesta rewards", "aeroméxico", "aeromexico", "world elite", "linea de crédito", "tarjeta de crédito", "tarjeta de debito"],
    weak: ["card", "cards", "tarjeta", "tarjetas", "crédito", "credito", "débito", "debito", "platino"]
  },
  nomina: {
    strong: ["portabilidad de nómina", "portabilidad de nomina", "preclas", "nomíname", "nominame", "dispersion de nomina"],
    weak: ["nómina", "nomina", "portabilidad", "sueldo"]
  },
  institucional: {
    strong: ["institucional", "brand awareness", "eCPM", "ecpm", "ots"],
    weak: ["branding", "reach", "alcance", "posicionamiento", "frecuencia"]
  },
  pymes: {
    strong: ["pyme", "pymes", "cuentas pyme", "terminal punto de venta", "tpv", "crédito empresarial", "credito empresarial"],
    weak: ["negocios", "solución empresarial"]
  },
  general: { strong: [], weak: [] }
};

function blockMatchesVertical(block: string, category: string): boolean {
  const spec = VERTICAL_KEYWORDS[category];
  if (!spec) return true;
  const lowerBlock = block.toLowerCase();
  const otherCategories = Object.keys(VERTICAL_KEYWORDS).filter(c => c !== category && c !== "general");
  const isOtherVerticalTag = otherCategories.some(other =>
    lowerBlock.includes(`[vertical: ${other}]`) ||
    lowerBlock.includes(`vertical: ${other}`) ||
    lowerBlock.includes(`categoría: ${other}`)
  );
  if (isOtherVerticalTag) return false;
  if (lowerBlock.includes(`[vertical: ${category}]`) || lowerBlock.includes(`categoría: ${category}`)) return true;
  if (lowerBlock.includes("politica general") || lowerBlock.includes("regla general") || lowerBlock.includes("manual corporativo")) return true;
  const strongHits = spec.strong.filter(kw => lowerBlock.includes(kw.toLowerCase())).length;
  const weakHits = spec.weak.filter(kw => lowerBlock.includes(kw.toLowerCase())).length;
  return strongHits >= 1 || weakHits >= 2;
}

/**
 * Filters Few-Shot Examples and RAG Memory Documents based on the selected vertical category.
 */
function filterContextByVertical(
  category: string,
  examples: any[],
  baseContext: string
): { filteredExamples: any[]; filteredBaseContext: string; ragSummary: string } {
  if (category === "general" || !category) {
    return {
      filteredExamples: examples,
      filteredBaseContext: baseContext,
      ragSummary: `Memoria RAG en modo General (${examples.length} ejemplos Few-Shot, contexto global sin filtrar).`
    };
  }

  let filteredExamples = examples.filter((ex: any) => {
    if (ex.category && ex.category !== "general") {
      return ex.category === category;
    }
    const textToSearch = `${ex.name || ""} ${ex.input || ""} ${ex.output || ""}`;
    return blockMatchesVertical(textToSearch, category);
  });

  if (filteredExamples.length === 0 && examples.length > 0) {
    filteredExamples = examples.filter((ex: any) => ex.category === "general" || !ex.category);
  }

  let filteredBaseContext = baseContext;
  if (baseContext && baseContext.trim()) {
    const docBlocks = baseContext.split(/(?=--- (?:DOCUMENTO|ARCHIVO))/i);
    if (docBlocks.length > 1) {
      const matchingBlocks = docBlocks.filter((block) => blockMatchesVertical(block, category));
      if (matchingBlocks.length > 0) {
        filteredBaseContext = matchingBlocks.join("\n\n").trim();
      }
    }
  }

  const ragSummary = `Segmentación RAG Focus (${category.toUpperCase()}): ${filteredExamples.length}/${examples.length} ejemplos Few-Shot activos y memoria RAG adaptada a ${category}.`;

  return {
    filteredExamples,
    filteredBaseContext,
    ragSummary
  };
}

// API routes first
app.get("/api/session", (req, res) => {
  if (!originAllowed(req)) {
    return res.status(403).json({ error: "Origen no permitido." });
  }
  const existingToken = getRequestSessionToken(req);
  if (existingToken && isValidSessionToken(existingToken)) {
    return res.json({ ok: true, sessionToken: existingToken });
  }
  const newToken = issueSessionCookie(res);
  res.json({ ok: true, sessionToken: newToken });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.post("/api/generate", requireAgentSession, async (req, res) => {
  if (!allowRate(clientIp(req), 20, 60_000)) {
    return res.status(429).json({ error: "Demasiadas solicitudes. Esperá un minuto." });
  }
  try {
    const {
      inputData,
      examples = [],
      baseContext = "",
      mode = "report",
      screenshots = [],
      category = "general",
      visualizationMode = "single" // 'single' | 'none' | 'full'
    } = req.body;

    const categoryNames: Record<string, string> = {
      cards: "OP Cards (Tarjetas de Crédito / Débito Santander)",
      nomina: "OP Nómina (Portabilidad, Preclas y Colocación de Nómina Santander)",
      institucional: "OP Institucional (Branding, Alcance, eCPM y Posicionamiento)",
      pymes: "OP Pymes y Empresas (Crédito Empresarial y Cuentas)",
      general: "OP General / Multi-Producto Santander"
    };

    const categoryLabel = categoryNames[category] || categoryNames.general;

    const safeExamples = (Array.isArray(examples) ? examples : [])
      .slice(0, MAX_EXAMPLES)
      .map((ex: any) => ({
        ...ex,
        input: String(ex?.input || "").slice(0, MAX_EXAMPLE_INPUT_CHARS),
        output: String(ex?.output || "").slice(0, MAX_EXAMPLE_OUTPUT_CHARS),
      }));
    const safeInput = String(inputData || "").slice(0, MAX_INPUT_CHARS);
    const safeContext = String(baseContext || "").slice(0, MAX_CONTEXT_CHARS);

    const { filteredExamples, filteredBaseContext, ragSummary } = filterContextByVertical(category, safeExamples, safeContext);
    console.log(`[RAG Focus Server] ${ragSummary} | VizMode: ${visualizationMode}`);

    const formattedExamples = wrapUntrusted(
      "STYLE_EXAMPLES",
      filteredExamples.map((ex: any) =>
        `Plantilla de formato [Vertical: ${ex.category || category}]:\nINPUT:\n${ex.input}\n\nOUTPUT (estructura, no copiar cifras):\n${ex.output}`
      ).join("\n\n---\n\n"),
      MAX_CONTEXT_CHARS
    );

    const ai = getGeminiClient();
    const model = req.body.model || "gemini-2.5-flash";

    let finalOutputText = "";
    let finalRegisteredPanel: ReturnType<typeof mergeKpiPanel> = null;

    if (mode === "report") {
      let vizInstruction = "";
      if (visualizationMode === "none") {
        vizInstruction = `3. MODO DE SALIDA: SOLO REPORTE MARKDOWN EJECUTIVO
   - El entregable central es el reporte en Markdown limpio.
   - Queda PROHIBIDO incluir etiquetas XML de gráficos (<chart_payload>) o paneles KPI.`;
      } else if (visualizationMode === "full") {
        vizInstruction = `3. PANEL KPI DEL ONE-PAGER (SCORECARDS + MULTI-GRÁFICOS AVANZADOS):
${verticalVizHints(category)}
   - Invocá las herramientas generarScorecards y generarGrafico para estructurar el panel.`;
      } else {
        // Default: 'single' (Gráfico principal ligero de validación)
        vizInstruction = `3. VALIDACIÓN VISUAL: GRÁFICO PRINCIPAL DE PARÁMETRO (1 SOLO GRÁFICO RÁPIDO):
   - El entregable CENTRAL Y PRIORITARIO es el reporte en Markdown.
   - Si en los datos del input o capturas existen desgloses numéricos por canal (ej: Paid Search, Social, Display, Orgánico), conversiones o sesiones, incluye al final del todo (después de 'PRÓXIMAS ACCIONES') un único bloque JSON para tener un parámetro visual rápido de que los datos y proporciones estén bien:
   <chart_payload>
   {
     "title": "Métricas Clave de Performance por Canal",
     "type": "bar",
     "data": [
       {"name": "Paid Search", "value": 15400},
       {"name": "Paid Social", "value": 12300}
     ]
   }
   </chart_payload>
   - Si no hay datos tabulares para graficar, no agregues el bloque <chart_payload>.`;
      }

      const passPrompt = `
[MODO: ANÁLISIS INTEGRAL DE PERFORMANCE Y RENDIMIENTO - ENFOQUE: ${categoryLabel.toUpperCase()}]
Sos el Agente de Performance para Santander México de Media.Monks especializado en el vertical **${categoryLabel}**.

[SEGMENTACIÓN DINÁMICA DE CONTEXTO RAG]
${ragSummary}
Has recibido plantillas de FORMATO (no cifras) de la vertical ${categoryLabel}. Copiá la estructura, nunca los números de las plantillas. Usá exclusivamente las cifras del bloque UNTRUSTED_USER_INPUT y de las capturas de esta corrida.

Tu tarea es realizar un análisis completo del input y de las capturas de pantalla adjuntas en una sola pasada con foco especializado en ${categoryLabel}.

Pautas del análisis:
1. EXTRACCIÓN DE MÉTRICAS Y DATOS DE ${categoryLabel.toUpperCase()}:
   Extrae meticulosamente cada cifra e indicador por canal de performance (sesiones, descargas, conversiones, colocaciones, CTR, CPA, inversión) y comparativas específicas para este producto Santander.

2. DETECCIÓN DE RIESGOS PRECISA (CERO ALUCINACIONES Y CERO MEZCLAS DE VERTICALES):
   - Audita EXCLUSIVAMENTE las cifras e indicadores contenidos en el [USER INPUT] o capturas adjuntas de ESTA EJECUCIÓN ACTUAL para **${categoryLabel}**.
   - Queda ESTRICTAMENTE PROHIBIDO inventar, alucinar o importar alertas de riesgo de otros documentos, ejemplos o de OTRAS VERTICALES (por ejemplo: NUNCA generes una alerta de Pymes o Nómina cuando estés analizando Cards/Tarjetas, ni alertas de Tarjetas cuando estés analizando Institucional).
   - Escribe la etiqueta [[ALERTA_DE_RIESGO]] ÚNICAMENTE si en las métricas ingresadas en esta corrida para **${categoryLabel}** existe una caída o anomalía REAL mayor al -20% respecto a metas o periodos anteriores.
   - Si NO hay caídas > 20% en las métricas actuales de **${categoryLabel}**, NO agregues la etiqueta [[ALERTA_DE_RIESGO]] bajo ninguna circunstancia.
   - Queda ESTRICTAMENTE PROHIBIDO repetir la etiqueta [[ALERTA_DE_RIESGO]] en múltiples secciones. Si existe una alerta legítima en esta ejecución, ponla una sola vez al final.

${vizInstruction}

4. RAZONAMIENTO CONTRACTUAL MANDATORIO:
   Tu salida DEBE contener al inicio la etiqueta <thinking_steps> detallando tu razonamiento:
   <thinking_steps>
   Thought: [Diagnóstico RAG Focus para ${categoryLabel}] Auditando datos con ${ragSummary} Identificando cada KPI o canal provisto.
   Action: Validando coherencia de métricas y formateando One Pager ejecutivo.
   Observation: [Cifras detectadas o límites de tolerancia frente al 20%]
   </thinking_steps>

5. FORMATO DE ENTREGABLE REQUERIDO (Al final de tu respuesta):
   Tu One-Pager definitivo debe tener ESTRICTAMENTE esta estructura dividida en secciones y sub-secciones de insights adaptadas al producto/vertical:
   # 1. RESUMEN EJECUTIVO
   # 2. KEY INSIGHTS (BASADOS EN DATOS)
   ## Highlights Generales
   [Puntos clave y hallazgos generales de alto nivel sobre el desempeño global de la campaña, negocio y cumplimiento de metas]

   ## [SECCIÓN ESPECÍFICA DE PRODUCTO/VERTICAL]
   *REGLA OBLIGATORIA POR PRODUCTO/DOCUMENTO*: Identifica e incluye la sección temática propia del producto detectada en el input o documentos:
   - Para **Pymes & Empresas**: Incluye obligatoriamente la sección **## Adquisición** (Cuentas Pyme abiertas, TPVs/Terminales, Venta Cruzada) y/o **## Colocación de Crédito** (Líneas empresariales).
   - Para **Cards (Tarjetas)**: Incluye la sección **## Aprobaciones y Colocación TDC** (Funnels de aprobación, preclas, emisión).
   - Para **Nómina**: Incluye la sección **## Portabilidad y Preclasificación** (Trámites iniciados, nóminas activadas, OTPs).
   - Para **Institucional**: Incluye la sección **## Reach, Frecuencia y Branding** (OTS, eCPM, Impacto Home).
   - Para **General / Multi-producto**: Lee los documentos adjuntos e identifica la(s) sección(es) particulares de producto que se mencionan (ej: 'Adquisición', 'Conversión Digital', 'Retención') e inclúyelas explícitamente.

   ## Análisis de Tráfico
   [Puntos clave e insights sobre el comportamiento de tráfico, sesiones, usuarios únicos, interacción y conversión en sitio/app]

   ## Medios
   [Puntos clave e insights sobre el rendimiento por canal de medios (Paid Media, Search, Social, Influencers, AppsFlyer, etc.), inversión, CPA, CPI, CTR y eficiencia de pauta]

   # 3. PRÓXIMAS ACCIONES (NEXT STEPS)

6. REGLA FIT-TO-BOX Y FORMATO DE ENFATIZADO (NEGRITA ROJA SANTANDER):
   - DEBÉS utilizar negrita (**texto a destacar**) para resaltar las cifras clave, porcentajes, montos, KPIs, variaciones (YoY/MoM/MoD) y las frases de insights más importantes en cada viñeta.
   - La interfaz ejecutiva renderiza automáticamente todo texto en negrita (**...**) en color rojo Santander (#EC0000) para máxima legibilidad ejecutiva.
   - Redacta cada viñeta e insight de manera altamente condensada e impactante (idealmente entre 180 y 280 caracteres por punto) para garantizar un ajuste perfecto (Fit-to-Box) al pegarse en diapositivas de PowerPoint.

[MATERIAL DE REFERENCIA Y BENCHMARKS RAG (${categoryLabel.toUpperCase()})]
${wrapUntrusted("RAG_CONTEXT", filteredBaseContext || "", MAX_CONTEXT_CHARS)}

[PLANTILLAS DE FORMATO (${categoryLabel.toUpperCase()}) — NO COPIAR CIFRAS]
${formattedExamples}

[DATOS DE ESTA CORRIDA]
${wrapUntrusted("USER_INPUT", safeInput, MAX_INPUT_CHARS)}
`;

      const parts: any[] = [{ text: passPrompt }];
      const safeScreenshots = Array.isArray(screenshots) ? screenshots.slice(0, MAX_SCREENSHOTS) : [];
      for (const s of safeScreenshots) {
        const mimeType = typeof s?.mimeType === "string" && s.mimeType.startsWith("image/") ? s.mimeType : "image/png";
        const cleanB64 = String(s?.data || "").replace(/^data:image\/\w+;base64,/, "").slice(0, MAX_SCREENSHOT_CHARS);
        if (cleanB64) {
          parts.push({ inlineData: { mimeType, data: cleanB64 } });
        }
      }

      console.log(`Iniciando generación de One Pager (VizMode: ${visualizationMode})...`);
      const toolsToUse = visualizationMode === "full" ? agentTools : [];
      const { text: finalOutput, registeredPanel } = await runGeminiWithTools(
        ai,
        model,
        [{ role: "user", parts }],
        SYSTEM_INSTRUCTION,
        toolsToUse
      );

      finalRegisteredPanel = registeredPanel;
      finalOutputText = finalOutput;

    } else {
      // ==========================================
      // MULTI-STEP LOOP FOR SUPPORT MODE (CONSULTING CHAT)
      // ==========================================
      const supportPrompt = `
[MODO: CONSULTOR TÉCNICO]
Respondé la consulta usando solo el material de referencia y la pregunta. No inventes políticas.

[MATERIAL DE REFERENCIA]
${wrapUntrusted("RAG_CONTEXT", safeContext, MAX_CONTEXT_CHARS)}

[CONSULTA]
${wrapUntrusted("USER_QUESTION", safeInput, MAX_INPUT_CHARS)}
`;

      const { text: outputSup } = await runGeminiWithTools(
        ai,
        model,
        [{ role: "user", parts: [{ text: supportPrompt }] }],
        SYSTEM_INSTRUCTION,
        []
      );

      finalOutputText = outputSup;
    }

    if (finalRegisteredPanel && visualizationMode === "full") {
      finalOutputText += `\n\n<kpi_panel>\n${JSON.stringify(finalRegisteredPanel, null, 2)}\n</kpi_panel>`;
    }

    res.json({ text: sanitizeCleanText(finalOutputText) });

  } catch (error: any) {
    console.error("Express Gemini Controller Error:", error);
    res.status(500).json({ error: userFacingGeminiError(error) });
  }
});

// Interactive Dialogue & Refinement Endpoint (SKILL.state Architecture - arXiv:2608.26263)
app.post("/api/dialogue", requireAgentSession, async (req, res) => {
  if (!allowRate(clientIp(req), 40, 60_000)) {
    return res.status(429).json({ error: "Demasiadas solicitudes. Esperá un minuto." });
  }
  try {
    const { 
      question, 
      reportContext, 
      focusedTopic, 
      state = null,
      baseContext = "", 
      category = "general" 
    } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Se requiere una pregunta o consulta." });
    }

    const safeQuestion = String(question).slice(0, 4000);
    const safeReport = String(state?.reportText || reportContext || "").slice(0, MAX_INPUT_CHARS);
    const safeTopic = String(state?.focusedTopic || focusedTopic || "Insights Generales").slice(0, 500);
    const safeRisk = String(state?.detectedRisk || "").slice(0, 500);
    const safeCategory = String(state?.category || category || "general");
    const safeContext = String(baseContext || "").slice(0, MAX_CONTEXT_CHARS);

    const { filteredBaseContext } = filterContextByVertical(safeCategory, [], safeContext);

    const ai = getGeminiClient();
    const requestedModel = req.body.model || "gemini-2.5-flash";
    const fallbackModels = Array.from(new Set([
      requestedModel,
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-3.7-flash"
    ]));

    // Construct Explicit Structured Execution State (SKILL.state paradigm)
    const structuredExecutionState = {
      verticalCategory: safeCategory.toUpperCase(),
      focusedSection: safeTopic,
      activeRiskAlert: safeRisk || "Ninguna",
      verifiedReportContent: safeReport
    };

    const dialogueSystemInstruction = SYSTEM_INSTRUCTION + `\n\n[SKILL.state AGENT PROTOCOL (arXiv:2608.26263)]
- Operás bajo una especificación de skill inmutable con estado de ejecución explícito.
- Cada interacción procesa el ESTADO VIGENTE DEL REPORTE y la última instrucción del usuario sin acumulación de historial ruidoso.
- Queda strictly PROHIBIDO incluir etiquetas <thinking_steps>, secciones 'Thought', 'Action' o 'Observation'.
- Responde DIRECTAMENTE a los datos, métricas cuantitativas e información requerida.
- No utilices nombres propios de personas.`;

    const prompt = `
[SKILL_SPECIFICATION: SANTANDER_PERFORMANCE_ANALYST_SKILL]
Misión: Analizar, explicar o refinar puntos del One Pager ejecutivo de Santander con fidelidad matemática absoluta.
Reglas:
1. Basá tu análisis estrictamente en el [CURRENT_EXECUTION_STATE]. No inventes cifras.
2. Formato: Markdown limpio, con listas y negritas (**destacado**) para métricas.
3. No utilices nombres propios de personas.

[CURRENT_EXECUTION_STATE]
${wrapUntrusted("STRUCTURED_STATE", JSON.stringify(structuredExecutionState, null, 2), MAX_INPUT_CHARS)}

[BENCHMARK_AND_RULES: VERTICAL ${safeCategory.toUpperCase()}]
${wrapUntrusted("RAG_CONTEXT", filteredBaseContext || "", MAX_CONTEXT_CHARS)}

[LATEST_OBSERVATION_AND_USER_INSTRUCTION]
${wrapUntrusted("USER_INSTRUCTION", safeQuestion, 4000)}
`;

    let responseText = "";
    let success = false;
    let lastErr: any = null;

    for (const modelCandidate of fallbackModels) {
      try {
        console.log(`[SKILL.state Diálogo] Procesando con estado estructurado en modelo: ${modelCandidate}`);
        const result = await ai.models.generateContent({
          model: modelCandidate,
          contents: prompt,
          config: {
            systemInstruction: dialogueSystemInstruction,
            temperature: 0.25,
          }
        });
        responseText = result.text || "No se pudo generar una respuesta analítica en este momento.";
        
        // Limpiar cualquier etiqueta de pensamiento si el modelo llegara a emitirla
        responseText = responseText
          .replace(/<thinking_steps>[\s\S]*?<\/thinking_steps>/gi, "")
          .replace(/^(Thought|Action|Observation):\s*/gim, "")
          .trim();

        success = true;
        break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`[SKILL.state Fallback Warning] El modelo ${modelCandidate} falló. Error: ${err.message || err}`);
        if (!isRetryableGeminiError(err)) break;
      }
    }

    if (!success) {
      throw new Error(`Error en los modelos de Gemini al procesar la consulta: ${lastErr?.message || lastErr}`);
    }

    res.json({ text: sanitizeCleanText(responseText) });
  } catch (error: any) {
    console.error("Express Dialogue Controller Error:", error);
    res.status(500).json({ error: userFacingGeminiError(error) });
  }
});

// Setup Vite Dev server or Serve static built assets in Production
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware mounted successfully.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving production static assets from dist folder.");
  }
}

// Start listener
setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}).catch((err) => {
  console.error("Failed to setup Vite middleware on Express server:", err);
});
