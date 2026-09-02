import { ReportEntry } from "../types";

/** Format-only few-shots. No campaign figures — the model must use the current run's data. */
export const DEFAULT_STYLE_EXAMPLES: ReportEntry[] = [
  {
    id: "style-santander-cards",
    name: "Plantilla de estilo Cards",
    category: "cards",
    input: "Pegá aquí solo métricas de la corrida actual de Cards (colocaciones, CPA, aprobación, inversión, sesiones).",
    output: `# 1. RESUMEN EJECUTIVO
Una viñeta densa con el resultado vs meta de esta corrida (sin inventar cifras).

# 2. KEY INSIGHTS (BASADOS EN DATOS)
## Highlights Generales
- **KPI**: cifra de esta corrida y variación vs meta o periodo anterior.

## Aprobaciones y Colocación TDC
- Embudo de solicitud / aprobación / emisión usando únicamente el input.

## Análisis de Tráfico
- Sesiones y mix de canal de cada landing (Promociones, Días Santander, TyC, Conoce más) si están en el input.

## Medios
- Impresiones, clics, CTR, VTR e inversión paid presentes en el input.

# 3. PRÓXIMAS ACCIONES (NEXT STEPS)
- Acciones concretas derivadas de las cifras de esta corrida.`,
  },
  {
    id: "style-santander-nomina",
    name: "Plantilla de estilo Nómina",
    category: "nomina",
    input: "Pegá aquí solo métricas de la corrida actual de Nómina (portabilidad, preclas, sesiones, mix de canales).",
    output: `# 1. RESUMEN EJECUTIVO
Resultado de alcance, sesiones y colocaciones del periodo, sin cifras de otras verticales.

# 2. KEY INSIGHTS (BASADOS EN DATOS)
## Highlights Generales
- Cumplimiento vs plan con los números del input.

## Portabilidad y Preclasificación
- Trámites, OTP, nóminas activadas — solo si aparecen en el input.

## Análisis de Tráfico
- Volumen Paso 1 Porta In / Porta Out y mix orgánico vs paid vs comunicación directa.

## Medios
- Impresiones, completed views, sesiones LP, CPA/CR paid si están en el input.

# 3. PRÓXIMAS ACCIONES (NEXT STEPS)
- Mitigaciones si hay caída > 20% en el input; si no, no inventar alerta.`,
  },
  {
    id: "style-santander-institucional",
    name: "Plantilla de estilo Institucional",
    category: "institucional",
    input: "Pegá aquí métricas de branding de esta corrida (reach, inversión, impresiones, views, eCPM, tráfico home).",
    output: `# 1. RESUMEN EJECUTIVO
Eficiencia de inversión vs entregables del periodo.

# 2. KEY INSIGHTS (BASADOS EN DATOS)
## Highlights Generales
- Inversión ejecutada vs plan, con cifras del input.

## Reach, Frecuencia y Branding
- Reach, OTS/eCPM y frecuencia reportados.

## Análisis de Tráfico
- Tráfico home u otros hubs solo si el input los menciona.

## Medios
- Costos y cobertura del mix actual.

# 3. PRÓXIMAS ACCIONES (NEXT STEPS)
- Escala o recorte según ahorros o desvíos reales.`,
  },
  {
    id: "style-santander-pymes",
    name: "Plantilla de estilo Pymes",
    category: "pymes",
    input: "Pegá aquí métricas Pyme de esta corrida (cuentas, crédito, CPA, TPV, tráfico).",
    output: `# 1. RESUMEN EJECUTIVO
Captación de cuentas y colocación de crédito del periodo.

# 2. KEY INSIGHTS (BASADOS EN DATOS)
## Highlights Generales
- Aperturas y financiamiento con cifras del input.

## Adquisición
- Cuentas Pyme y TPV si están en el input.

## Análisis de Tráfico
- Sesiones landing ATR, agendador de citas y mix de canal (sin inventar TBD).

## Medios
- Citas y contactos por canal paid (Google, Meta, TikTok, Influencers) si hay cifras reales.

# 3. PRÓXIMAS ACCIONES (NEXT STEPS)
- Bundles o reasignación según datos de esta corrida.`,
  },
];
