import { ReportEntry, Screenshot, ReportCategory, VisualizationMode, SkillExecutionState } from "../types";
import { sanitizeCleanText } from "./textSanitizer";
import {
  MAX_CONTEXT_CHARS,
  MAX_EXAMPLE_INPUT_CHARS,
  MAX_EXAMPLE_OUTPUT_CHARS,
  MAX_EXAMPLES,
  MAX_INPUT_CHARS,
  MAX_SCREENSHOTS,
  MAX_SCREENSHOT_CHARS,
} from "./payloadLimits";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const LIGHTWEIGHT_GEMINI_MODEL = "gemini-flash-latest";

export const AVAILABLE_GEMINI_MODELS = [
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
] as const;

export type SupportedGeminiModel = (typeof AVAILABLE_GEMINI_MODELS)[number] | string;

let cachedSessionToken: string | null = null;
let sessionPromise: Promise<string> | null = null;

export async function ensureApiSession(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const res = await fetch("/api/session", { credentials: "include" });
        if (!res.ok) {
          sessionPromise = null;
          throw new Error("No se pudo iniciar la sesión del agente.");
        }
        const data = await res.json().catch(() => ({}));
        if (data.sessionToken) {
          cachedSessionToken = data.sessionToken;
          try {
            sessionStorage.setItem("santander_session_token", data.sessionToken);
          } catch {
            // ignore
          }
        }
        return cachedSessionToken || "";
      } catch (err) {
        sessionPromise = null;
        throw err;
      }
    })();
  }
  return sessionPromise;
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2, delayMs = 1000): Promise<any> {
  await ensureApiSession();
  const token = cachedSessionToken || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("santander_session_token") : null);
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
          ...(options.headers || {}),
          ...(token ? { "x-session-token": token, "Authorization": `Bearer ${token}` } : {}),
        },
      });
      const rawText = await response.text();
      const trimmed = rawText.trim();

      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw new Error("El servidor devolvió un formato no válido (HTML/Servidor en reinicio).");
      }

      const data = JSON.parse(trimmed);
      if (!response.ok) {
        if (response.status === 401) {
          sessionPromise = null;
          cachedSessionToken = null;
          try {
            sessionStorage.removeItem("santander_session_token");
          } catch {}
          await ensureApiSession();
          if (attempt < maxRetries) continue;
        }
        throw new Error(data.error || `Error del servidor (${response.status})`);
      }
      return data;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

function compactExamples(examples: ReportEntry[], category: ReportCategory): ReportEntry[] {
  return examples
    .filter((ex) => (ex.input || "").trim() || (ex.output || "").trim())
    .filter((ex) => {
      if (category === "general") return true;
      return !ex.category || ex.category === "general" || ex.category === category;
    })
    .slice(0, MAX_EXAMPLES)
    .map((ex) => ({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      input: (ex.input || "").slice(0, MAX_EXAMPLE_INPUT_CHARS),
      output: (ex.output || "").slice(0, MAX_EXAMPLE_OUTPUT_CHARS),
    }));
}

function compactScreenshots(screenshots: Screenshot[]) {
  return screenshots.slice(0, MAX_SCREENSHOTS).map((s) => ({
    mimeType: s.mimeType,
    data: (s.data || "").replace(/^data:image\/\w+;base64,/, "").slice(0, MAX_SCREENSHOT_CHARS),
  }));
}

export async function generateOnePager(
  inputData: string,
  examples: ReportEntry[],
  baseContext: string = "",
  mode: "report" | "support" = "report",
  screenshots: Screenshot[] = [],
  category: ReportCategory = "general",
  model: SupportedGeminiModel = DEFAULT_GEMINI_MODEL,
  visualizationMode: VisualizationMode = "single"
): Promise<string> {
  try {
    const data = await fetchWithRetry("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputData: (inputData || "").slice(0, MAX_INPUT_CHARS),
        examples: compactExamples(examples, category),
        baseContext: (baseContext || "").slice(0, MAX_CONTEXT_CHARS),
        mode,
        screenshots: compactScreenshots(screenshots),
        category,
        model,
        visualizationMode,
      }),
    });
    return sanitizeCleanText(data.text || "");
  } catch (error: any) {
    console.error("Client-Side api proxy error:", error);
    throw new Error(error.message || "Error al comunicarse con el Agente Santander.");
  }
}

export async function askInsightDialogue(
  question: string,
  stateOrReport: string | SkillExecutionState,
  focusedTopic: string = "",
  chatHistory: { role: "user" | "assistant"; content: string }[] = [],
  baseContext: string = "",
  category: ReportCategory = "general",
  model: SupportedGeminiModel = DEFAULT_GEMINI_MODEL
): Promise<string> {
  try {
    const isStateObject = typeof stateOrReport === "object" && stateOrReport !== null;
    const executionState: SkillExecutionState = isStateObject
      ? (stateOrReport as SkillExecutionState)
      : {
          reportText: String(stateOrReport || ""),
          category: category,
          focusedTopic: focusedTopic,
        };

    const data = await fetchWithRetry("/api/dialogue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: (question || "").slice(0, 4000),
        state: {
          reportText: (executionState.reportText || "").slice(0, MAX_INPUT_CHARS),
          category: executionState.category || category || "general",
          focusedTopic: (executionState.focusedTopic || focusedTopic || "").slice(0, 500),
          detectedRisk: executionState.detectedRisk || null,
        },
        reportContext: (executionState.reportText || "").slice(0, MAX_INPUT_CHARS),
        focusedTopic: (executionState.focusedTopic || focusedTopic || "").slice(0, 500),
        baseContext: (baseContext || "").slice(0, MAX_CONTEXT_CHARS),
        category: executionState.category || category || "general",
        model,
      }),
    });
    return sanitizeCleanText(data.text || "");
  } catch (error: any) {
    console.error("Dialogue API error (SKILL.state):", error);
    throw new Error(error.message || "Error al conectar con la consulta interactiva.");
  }
}
