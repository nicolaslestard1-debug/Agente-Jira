export type ReportCategory = 'cards' | 'nomina' | 'institucional' | 'pymes' | 'general';

export type VisualizationMode = 'single' | 'none' | 'full';

export type KpiSection = 'trafico' | 'medios' | 'producto' | 'general';

export interface ChartPayload {
  title: string;
  type: 'bar' | 'line' | 'pie';
  data: { name: string; value: number }[];
  section?: KpiSection;
  unit?: string;
}

export interface Scorecard {
  section: KpiSection;
  label: string;
  valueLabel: string;
  numericValue?: number;
  unit?: string;
  delta?: string;
  note?: string;
}

export interface KpiPanel {
  scorecards: Scorecard[];
  charts: ChartPayload[];
}

export interface SavedReport {
  id: string;
  title: string;
  category: ReportCategory;
  createdAt: string;
  input: string;
  output: string;
  detectedRisk?: string | null;
  thinkingSteps?: { type: 'thought' | 'action' | 'observation' | 'generic'; text: string }[];
  chartData?: ChartPayload | null;
  kpiPanel?: KpiPanel | null;
}

export interface ReportEntry {
  id: string;
  name: string;
  input: string;
  output: string;
  category?: ReportCategory;
}

export interface GeneratorConfig {
  systemPrompt: string;
  examples: ReportEntry[];
}

export interface Screenshot {
  id: string;
  name: string;
  data: string; // base64 raw string without data format prefix
  mimeType: string;
  previewUrl: string; // data URI for previewing in the UI
}

export interface TrainingDoc {
  id: string;
  name: string;
  type: string;
  charCount: number;
  content: string;
  source: 'upload' | 'drive';
  category?: ReportCategory;
}

export interface SkillExecutionState {
  reportText: string;
  category: ReportCategory;
  detectedRisk?: string | null;
  focusedTopic?: string;
  chartData?: ChartPayload | null;
  kpiPanel?: KpiPanel | null;
}

export interface AppState {
  currentInput: string;
  isGenerating: boolean;
  generatedReport: string;
  config: GeneratorConfig;
  baseContext: string;
  selectedCategory: ReportCategory;
}
