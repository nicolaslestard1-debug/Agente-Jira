import {
  ChartPayload,
  KpiPanel,
  KpiSection,
  ReportCategory,
  Scorecard,
} from "../types";

export type ThinkingStep = {
  type: "thought" | "action" | "observation" | "generic";
  text: string;
};

export type { ChartPayload, KpiPanel, Scorecard };

const CATEGORY_KEYWORDS: Record<Exclude<ReportCategory, "general">, string[]> = {
  cards: ["card", "cards", "tarjeta", "tarjetas", "tdc", "tdd", "likeu", "crédito", "credito", "débito", "debito", "plástico", "plastico"],
  nomina: ["nómina", "nomina", "portabilidad", "preclas", "sueldo", "colocación", "colocacion"],
  institucional: ["institucional", "branding", "reach", "alcance", "ecpm", "frecuencia", "ots"],
  pymes: ["pyme", "pymes", "tpv", "crédito empresarial", "cuentas pyme"],
};

const SECTIONS: KpiSection[] = ["trafico", "medios", "producto", "general"];
const MAX_CHARTS = 8;
const MAX_SCORECARDS = 20;
const MAX_CHART_POINTS = 16;

function normalizeSection(raw: unknown): KpiSection {
  const value = String(raw || "").toLowerCase().trim();
  if (SECTIONS.includes(value as KpiSection)) return value as KpiSection;
  if (value.includes("traf") || value.includes("landing") || value.includes("sesion") || value.includes("sesión")) {
    return "trafico";
  }
  if (value.includes("medio") || value.includes("paid") || value.includes("pauta")) {
    return "medios";
  }
  if (value.includes("producto") || value.includes("coloc") || value.includes("adquis") || value.includes("preclas") || value.includes("brand")) {
    return "producto";
  }
  return "general";
}

export function parseChartPayload(raw: string): ChartPayload | null {
  try {
    let jsonStr = raw.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed = JSON.parse(jsonStr);
    return normalizeChart(parsed);
  } catch {
    return null;
  }
}

export function normalizeChart(parsed: any): ChartPayload | null {
  const type = parsed?.type;
  if (type !== "bar" && type !== "line" && type !== "pie") return null;
  if (!Array.isArray(parsed?.data)) return null;
  const data = parsed.data
    .map((row: { name?: unknown; value?: unknown }) => ({
      name: String(row?.name ?? "").trim().slice(0, 80),
      value: Number(row?.value),
    }))
    .filter((row: { name: string; value: number }) => row.name && Number.isFinite(row.value));
  if (data.length === 0) return null;
  const unit = String(parsed.unit || "").trim().slice(0, 40);
  return {
    title: String(parsed.title || "Métricas").slice(0, 160),
    type,
    data: data.slice(0, MAX_CHART_POINTS),
    section: normalizeSection(parsed.section),
    unit: unit || undefined,
  };
}

export function normalizeScorecard(parsed: any): Scorecard | null {
  const label = String(parsed?.label || parsed?.name || "").trim().slice(0, 80);
  const valueLabel = String(parsed?.valueLabel || parsed?.value_label || parsed?.displayValue || "").trim().slice(0, 48);
  if (!label || !valueLabel) return null;
  const numericRaw = parsed?.numericValue ?? parsed?.numeric_value ?? parsed?.value;
  const numericValue = numericRaw === undefined || numericRaw === null || numericRaw === ""
    ? undefined
    : Number(numericRaw);
  const delta = String(parsed?.delta || "").trim().slice(0, 48);
  const note = String(parsed?.note || "").trim().slice(0, 140);
  const unit = String(parsed?.unit || "").trim().slice(0, 40);
  return {
    section: normalizeSection(parsed?.section),
    label,
    valueLabel,
    numericValue: Number.isFinite(numericValue as number) ? (numericValue as number) : undefined,
    unit: unit || undefined,
    delta: delta || undefined,
    note: note || undefined,
  };
}

export function parseScorecardsPayload(raw: string | object): Scorecard[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.scorecards)
        ? parsed.scorecards
        : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
    return list.map(normalizeScorecard).filter(Boolean).slice(0, MAX_SCORECARDS) as Scorecard[];
  } catch {
    return [];
  }
}

export function parseKpiPanel(raw: string | object): KpiPanel | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const charts = (Array.isArray(parsed?.charts) ? parsed.charts : [])
      .map(normalizeChart)
      .filter(Boolean)
      .slice(0, MAX_CHARTS) as ChartPayload[];
    const scorecards = parseScorecardsPayload(parsed);
    if (charts.length === 0 && scorecards.length === 0) return null;
    return { charts, scorecards };
  } catch {
    return null;
  }
}

export function panelFromLegacyChart(chart: ChartPayload | null | undefined): KpiPanel | null {
  if (!chart) return null;
  return { scorecards: [], charts: [chart] };
}

export function hasKpiVisuals(panel: KpiPanel | null | undefined): boolean {
  return Boolean(panel && (panel.charts.length > 0 || panel.scorecards.length > 0));
}

export function mergeKpiPanel(scorecards: Scorecard[], charts: ChartPayload[]): KpiPanel | null {
  const uniqueCharts: ChartPayload[] = [];
  const seen = new Set<string>();
  for (const chart of charts) {
    const key = `${chart.section}|${chart.title}|${chart.unit || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCharts.push(chart);
    if (uniqueCharts.length >= MAX_CHARTS) break;
  }
  const uniqueCards: Scorecard[] = [];
  const seenCards = new Set<string>();
  for (const card of scorecards) {
    const key = `${card.section}|${card.label}`;
    if (seenCards.has(key)) continue;
    seenCards.add(key);
    uniqueCards.push(card);
    if (uniqueCards.length >= MAX_SCORECARDS) break;
  }
  if (uniqueCharts.length === 0 && uniqueCards.length === 0) return null;
  return { charts: uniqueCharts, scorecards: uniqueCards };
}

export function parseAgentOutput(
  result: string,
  selectedCategory: ReportCategory
): {
  cleanText: string;
  steps: ThinkingStep[];
  chartJson: ChartPayload | null;
  kpiPanel: KpiPanel | null;
  riskText: string | null;
} {
  let cleanText = result;
  const steps: ThinkingStep[] = [];
  let chartJson: ChartPayload | null = null;
  let kpiPanel: KpiPanel | null = null;
  let riskText: string | null = null;

  const stepsMatch = cleanText.match(/<thinking_steps>([\s\S]*?)<\/thinking_steps>/i);
  if (stepsMatch) {
    const lines = stepsMatch[1].trim().split("\n");
    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine.toLowerCase().startsWith("thought:")) {
        steps.push({ type: "thought", text: trimmedLine.substring(8).trim() });
      } else if (trimmedLine.toLowerCase().startsWith("action:")) {
        steps.push({ type: "action", text: trimmedLine.substring(7).trim() });
      } else if (trimmedLine.toLowerCase().startsWith("observation:")) {
        steps.push({ type: "observation", text: trimmedLine.substring(12).trim() });
      } else if (trimmedLine) {
        steps.push({ type: "generic", text: trimmedLine });
      }
    });
    cleanText = cleanText.replace(/<thinking_steps>[\s\S]*?<\/thinking_steps>/gi, "").trim();
  }

  const riskRegex = /\[\[ALERTA_DE_RIESGO\]\]\s*([^\n]*)/gi;
  const riskMatches = Array.from(cleanText.matchAll(riskRegex));

  if (riskMatches.length > 0) {
    const alertMessages = riskMatches
      .map((m) => m[1].trim())
      .filter(Boolean)
      .map((msg) =>
        msg
          .replace(/\b(para|a|de|atención|atencion)\s+(Nico|Nicolás|Nicolas)\b/gi, "$1 el equipo")
          .replace(/\b(Nico|Nicolás|Nicolas)\b:?/gi, "")
          .trim()
      )
      .filter((msg) => {
        if (selectedCategory === "general") return true;
        const lowerMsg = msg.toLowerCase();
        const otherCategories = (Object.keys(CATEGORY_KEYWORDS) as Exclude<ReportCategory, "general">[])
          .filter((c) => c !== selectedCategory);
        for (const other of otherCategories) {
          const mentionsOther = CATEGORY_KEYWORDS[other].some((kw) => lowerMsg.includes(kw));
          const mentionsCurrent = CATEGORY_KEYWORDS[selectedCategory].some((kw) => lowerMsg.includes(kw));
          if (mentionsOther && !mentionsCurrent) return false;
        }
        return true;
      });

    const uniqueMessages = Array.from(new Set(alertMessages));
    riskText = uniqueMessages.length > 0 ? uniqueMessages.join(" | ") : null;
    cleanText = cleanText.replace(/\[\[ALERTA_DE_RIESGO\]\]\s*[^\n]*\n?/gi, "").trim();
  }

  const panelMatch = cleanText.match(/<kpi_panel>([\s\S]*?)(?:<\/kpi_panel>|$)/i);
  if (panelMatch) {
    kpiPanel = parseKpiPanel(panelMatch[1]);
    cleanText = cleanText.replace(/<kpi_panel>[\s\S]*?(?:<\/kpi_panel>|$)/gi, "").trim();
  }

  const chartMatch = cleanText.match(/<chart_payload>([\s\S]*?)(?:<\/chart_payload>|$)/i);
  if (chartMatch) {
    chartJson = parseChartPayload(chartMatch[1]);
    cleanText = cleanText.replace(/<chart_payload>[\s\S]*?(?:<\/chart_payload>|$)/gi, "").trim();
  }

  if (!kpiPanel && chartJson) {
    kpiPanel = panelFromLegacyChart(chartJson);
  } else if (kpiPanel && chartJson) {
    kpiPanel = mergeKpiPanel(kpiPanel.scorecards, [...kpiPanel.charts, chartJson]);
  }

  if (!chartJson && kpiPanel?.charts[0]) {
    chartJson = kpiPanel.charts[0];
  }

  return { cleanText, steps, chartJson, kpiPanel, riskText };
}
