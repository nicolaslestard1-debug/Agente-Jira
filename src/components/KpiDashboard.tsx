import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
} from "recharts";
import { AreaChart } from "lucide-react";
import { ChartPayload, KpiPanel, KpiSection, Scorecard } from "../types";

const SECTION_ORDER: KpiSection[] = ["general", "trafico", "medios", "producto"];

const SECTION_LABEL: Record<KpiSection, string> = {
  general: "Highlights",
  trafico: "Análisis de tráfico",
  medios: "Medios / Paid media",
  producto: "Producto",
};

const CHART_COLORS = ["#EC0000", "#3B82F6", "#1C1C1C", "#6366F1", "#A855F7", "#D00000", "#4A4A4A"];

function tooltipStyle(isDark: boolean) {
  return {
    backgroundColor: isDark ? "#1A202E" : "#fff",
    borderColor: isDark ? "#2A3347" : "#e2e8f0",
    borderRadius: "8px",
    fontSize: "11px",
    color: isDark ? "#fff" : "#000",
  };
}

function MetricChart({
  chart,
  isDark,
}: {
  chart: ChartPayload;
  isDark: boolean;
}) {
  const grid = isDark ? "#222838" : "#e8e8e8";
  const axis = isDark ? "#94A3B8" : "#666";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-gray-800 dark:text-gray-100">{chart.title}</h4>
        <span className="text-[10px] bg-santander-red/10 text-santander-red px-2 py-0.5 rounded font-mono font-bold uppercase shrink-0">
          {chart.type}
          {chart.unit ? ` · ${chart.unit}` : ""}
        </span>
      </div>
      <div className="h-64 w-full bg-[#FAF9F8] dark:bg-[#0E121A] p-3 border border-gray-100 dark:border-[#222838] rounded-lg flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="name" stroke={axis} fontSize={10} tickLine={false} />
              <YAxis stroke={axis} fontSize={10} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle(isDark)} />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: "11px" }} />
              <Line type="monotone" dataKey="value" stroke="#EC0000" strokeWidth={3} activeDot={{ r: 7 }} name={chart.unit || "KPI"} />
            </LineChart>
          ) : chart.type === "pie" ? (
            <PieChart>
              <Pie
                data={chart.data}
                cx="50%"
                cy="50%"
                labelLine
                outerRadius={72}
                dataKey="value"
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                }
              >
                {chart.data.map((_, index) => (
                  <Cell key={`${chart.title}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle(isDark)} />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
            </PieChart>
          ) : (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="name" stroke={axis} fontSize={10} tickLine={false} />
              <YAxis stroke={axis} fontSize={10} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle(isDark)} cursor={{ fill: "rgba(236, 0, 0, 0.08)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name={chart.unit || "Valor"}>
                {chart.data.map((_, index) => (
                  <Cell key={`${chart.title}-bar-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <table className="w-full text-left text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-[#222838] rounded-lg overflow-hidden">
        <thead className="bg-[#FAF9F8] dark:bg-[#131722] text-[9px] uppercase font-bold text-gray-400">
          <tr>
            <th className="px-3 py-2">Indicador / canal</th>
            <th className="px-3 py-2 text-right">{chart.unit || "Valor"}</th>
          </tr>
        </thead>
        <tbody>
          {chart.data.map((row) => (
            <tr key={`${chart.title}-${row.name}`} className="border-t border-gray-100 dark:border-[#222838]">
              <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-200">{row.name}</td>
              <td className="px-3 py-1.5 text-right font-mono font-bold text-santander-red">
                {row.value.toLocaleString("es-MX")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScorecardGrid({ cards }: { cards: Scorecard[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
      {cards.map((card) => (
        <div
          key={`${card.section}-${card.label}`}
          className="border border-gray-100 dark:border-[#222838] rounded-lg p-3 bg-white dark:bg-[#10141E]"
        >
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 leading-tight">
            {card.label}
          </p>
          <p className="mt-1 text-lg font-black text-santander-red leading-none">
            {card.valueLabel}
            {card.unit && !card.valueLabel.toLowerCase().includes(card.unit.toLowerCase()) ? (
              <span className="ml-1 text-[11px] font-bold text-gray-500">{card.unit}</span>
            ) : null}
          </p>
          {card.delta ? (
            <p className="mt-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-300">{card.delta}</p>
          ) : null}
          {card.note ? (
            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 leading-snug">{card.note}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function KpiDashboard({
  panel,
  isDark,
}: {
  panel: KpiPanel;
  isDark: boolean;
}) {
  const sections = SECTION_ORDER.filter(
    (section) =>
      panel.scorecards.some((card) => card.section === section) ||
      panel.charts.some((chart) => (chart.section || "general") === section)
  );

  if (sections.length === 0) {
    return (
      <div className="text-center py-16 text-gray-300 dark:text-gray-600">
        <AreaChart className="w-12 h-12 text-gray-200 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-xs dark:text-gray-400">No hay scorecards ni gráficos para este one-pager.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Totales por sección del one-pager (como las cajas del PPT) y un gráfico por desglose, sin mezclar unidades.
      </p>
      {sections.map((section) => {
        const cards = panel.scorecards.filter((card) => card.section === section);
        const charts = panel.charts.filter((chart) => (chart.section || "general") === section);
        return (
          <section key={section} className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-[#222838] pb-2">
              {SECTION_LABEL[section]}
            </h3>
            {cards.length > 0 ? <ScorecardGrid cards={cards} /> : null}
            {charts.map((chart) => (
              <MetricChart key={`${section}-${chart.title}`} chart={chart} isDark={isDark} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
