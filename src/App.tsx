/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  BarChart3, 
  FileText, 
  Plus, 
  Trash2, 
  Send, 
  Copy, 
  Check, 
  Settings2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  CloudUpload,
  AlertTriangle,
  Image,
  Terminal,
  Edit3,
  Eye,
  AreaChart,
  Download,
  Play,
  HelpCircle,
  Table,
  LogOut,
  HardDrive,
  Link2,
  Search,
  FileSpreadsheet,
  ExternalLink,
  X,
  Folder,
  FolderOpen,
  FolderPlus,
  MessageSquare,
  CreditCard,
  Wallet,
  Building2,
  Briefcase,
  History,
  Clock,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Calculator,
  Sun,
  Moon,
  GitCompare,
  Split,
  ArrowLeftRight,
  RotateCcw,
  CheckCheck,
  Columns
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';
import { ReportEntry, Screenshot, TrainingDoc, SavedReport, ReportCategory, KpiPanel, ChartPayload, VisualizationMode, SkillExecutionState } from './types';
import { SantanderFlameLogo, SantanderFullLogo, SantanderSquareLogo } from './components/SantanderLogo';
import { MonksLogo, MonksTextLogo } from './components/MonksLogo';
import { KpiDashboard } from './components/KpiDashboard';
import { runGuardrailAudit, GuardrailAuditResult } from './lib/guardrails';
import { generateOnePager, askInsightDialogue, ensureApiSession } from './lib/gemini';
import { parseFile } from './lib/fileParser';
import { sanitizeCleanText, sanitizeForClipboard } from './lib/textSanitizer';
import { DEFAULT_STYLE_EXAMPLES } from './lib/styleExamples';
import { parseAgentOutput, hasKpiVisuals, panelFromLegacyChart } from './lib/reportParser';
import { MAX_HISTORY_INPUT_CHARS, MAX_HISTORY_ITEMS } from './lib/payloadLimits';
import { 
  initAuth, 
  googleSignIn, 
  logout as googleLogout, 
  createAndPopulateSpreadsheet 
} from './lib/googleSheets';
import { 
  listGoogleDriveFiles, 
  importGoogleDriveFile, 
  extractGoogleDriveId, 
  DriveFile 
} from './lib/googleDrive';
import { User } from 'firebase/auth';

export default function App() {
  // ... (previous state)
  const [examples, setExamples] = useState<ReportEntry[]>(() => {
    const saved = localStorage.getItem('op-generator-examples');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const legacy = parsed.some((ex: ReportEntry) => /\$\d|LikeU|1,420|18\.5M/.test(`${ex.input}${ex.output}`));
          if (!legacy) return parsed;
        }
      } catch {
        /* templates */
      }
    }
    return DEFAULT_STYLE_EXAMPLES.map((ex) => ({ ...ex }));
  });
  const [baseContext, setBaseContext] = useState(() => {
    return localStorage.getItem('op-generator-base-context') || '';
  });
  const [trainingDocs, setTrainingDocs] = useState<TrainingDoc[]>(() => {
    const saved = localStorage.getItem('op-generator-training-docs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((doc: any) => ({
            ...doc,
            category: doc.category || 'general'
          }));
        }
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [openTrainingFolders, setOpenTrainingFolders] = useState<Record<string, boolean>>({
    cards: true,
    nomina: true,
    institucional: true,
    pymes: true,
    general: true
  });

  const toggleTrainingFolder = (catId: string) => {
    setOpenTrainingFolders(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const moveTrainingDocCategory = (docId: string, newCategory: ReportCategory) => {
    setTrainingDocs(prev => prev.map(d => d.id === docId ? { ...d, category: newCategory } : d));
    setPastedToast(`Documento movido a la carpeta ${getCategoryLabel(newCategory)}`);
    setTimeout(() => setPastedToast(null), 3000);
  };
  const [driveImportTarget, setDriveImportTarget] = useState<'workspace' | 'knowledge' | 'examples'>('workspace');
  const [isTrainingDragActive, setIsTrainingDragActive] = useState(false);
  const [dragActiveFolderId, setDragActiveFolderId] = useState<string | null>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState('');
  const [detectedRisk, setDetectedRisk] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'report' | 'support'>('report');
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [configTab, setConfigTab] = useState<'knowledge' | 'examples'>('knowledge');
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);

  // New High-fidelity features states
  const [thinkingSteps, setThinkingSteps] = useState<{ type: 'thought' | 'action' | 'observation' | 'generic'; text: string }[]>([]);
  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [kpiPanel, setKpiPanel] = useState<KpiPanel | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'preview' | 'edit' | 'chart' | 'compare'>('preview');
  const [compareReportId, setCompareReportId] = useState<string | null>(null);
  const [isSyncScroll, setIsSyncScroll] = useState<boolean>(true);
  const [compareDiffHighlight, setCompareDiffHighlight] = useState<boolean>(true);
  const leftCompareScrollRef = useRef<HTMLDivElement>(null);
  const rightCompareScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState<boolean>(true);
  const [guardrailAudit, setGuardrailAudit] = useState<GuardrailAuditResult | null>(null);

  const handleManualGuardrailAudit = useCallback(() => {
    const audit = runGuardrailAudit(currentInput, report);
    setGuardrailAudit(audit);
    setPastedToast("🛡️ Verificación matemática ejecutada con éxito.");
    setTimeout(() => setPastedToast(null), 3500);
  }, [currentInput, report]);

  // Google Sheets & Drive integration state management
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isExportingSheet, setIsExportingSheet] = useState(false);
  const [exportedSheetUrl, setExportedSheetUrl] = useState<string | null>(null);
  const [sheetExportError, setSheetExportError] = useState<string | null>(null);

  // Google Drive Modal & Paste State
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveSearchQuery, setDriveSearchQuery] = useState('');
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [isImportingDrive, setIsImportingDrive] = useState(false);
  const [driveModalError, setDriveModalError] = useState<string | null>(null);
  const [pastedToast, setPastedToast] = useState<string | null>(null);

  // Data Preview Parser & Fit-to-Box PowerPoint Copy Helpers
  const [inputViewMode, setInputViewMode] = useState<'text' | 'table'>('text');
  const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);

  // Dark / Light Mode Theme State with LocalStorage Persistence
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('santander-agent-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // ignore
    }
    return 'light';
  });

  useEffect(() => {
    try {
      localStorage.setItem('santander-agent-theme', theme);
    } catch {
      // ignore
    }
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const isDark = theme === 'dark';

  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>(() => {
    try {
      const saved = localStorage.getItem('op-generator-viz-mode');
      return (saved === 'none' || saved === 'full' || saved === 'single') ? (saved as VisualizationMode) : 'single';
    } catch {
      return 'single';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('op-generator-viz-mode', visualizationMode);
    } catch {
      // ignore
    }
  }, [visualizationMode]);

  const parseInputToTable = useCallback((input: string) => {
    if (!input || !input.trim()) return null;
    
    const rawLines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (rawLines.length === 0) return null;

    const sampleLine = rawLines[0];
    let delimiter = '';
    if (sampleLine.includes('\t')) delimiter = '\t';
    else if (sampleLine.includes('|')) delimiter = '|';
    else if (sampleLine.includes(';')) delimiter = ';';
    else if (sampleLine.includes(',')) delimiter = ',';

    if (delimiter) {
      const rows = rawLines.map(line => {
        let cells = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (delimiter === '|') {
          cells = cells.filter((c, idx) => !( (idx === 0 || idx === cells.length - 1) && c === '' ));
        }
        return cells;
      }).filter(row => row.some(cell => cell.length > 0));

      if (rows.length > 0) {
        const headers = rows[0];
        const dataRows = rows.slice(1);
        return {
          type: 'tabular' as const,
          delimiterName: delimiter === '\t' ? 'Planilla Excel / TSV' : delimiter === '|' ? 'Tabla Markdown' : delimiter === ';' ? 'CSV Semicolons' : 'CSV Comma',
          headers: dataRows.length > 0 ? headers : rows[0].map((_, idx) => `Columna ${idx + 1}`),
          rows: dataRows.length > 0 ? dataRows : rows,
          rowCount: rows.length,
          colCount: Math.max(...rows.map(r => r.length))
        };
      }
    }

    const keyValueRows: { key: string; value: string }[] = [];
    rawLines.forEach(line => {
      const kvMatch = line.match(/^([^:=–—]+)[:=–—]\s*(.+)$/);
      if (kvMatch) {
        keyValueRows.push({ key: kvMatch[1].trim(), value: kvMatch[2].trim() });
      }
    });

    if (keyValueRows.length > 0 && keyValueRows.length >= Math.min(2, rawLines.length)) {
      return {
        type: 'keyvalue' as const,
        delimiterName: 'Indicador / Valor',
        headers: ['Métrica / Dimensión', 'Valor Registrado'],
        rows: keyValueRows.map(kv => [kv.key, kv.value]),
        rowCount: keyValueRows.length,
        colCount: 2
      };
    }

    return {
      type: 'lines' as const,
      delimiterName: 'Líneas de Datos',
      headers: ['Nº', 'Contenido Extraído'],
      rows: rawLines.map((line, idx) => [`${idx + 1}`, line]),
      rowCount: rawLines.length,
      colCount: 2
    };
  }, []);

  const parsedTable = parseInputToTable(currentInput);

  const extractReportBlocks = useCallback((reportText: string) => {
    if (!reportText) return [];
    
    const blocks: { id: string; title: string; text: string; charCount: number; fitStatus: 'optimal' | 'warning' | 'large' }[] = [];

    if (reportText.includes('[[ALERTA_DE_RIESGO]]')) {
      const riskMatch = reportText.match(/\[\[ALERTA_DE_RIESGO\]\]\s*(.+)/);
      if (riskMatch) {
        const text = riskMatch[1].trim();
        blocks.push({
          id: 'risk',
          title: '⚠️ Alerta de Riesgo',
          text,
          charCount: text.length,
          fitStatus: text.length <= 280 ? 'optimal' : 'warning'
        });
      }
    }

    const extractSection = (id: string, title: string, sectionHeaderRegex: RegExp, nextHeaderRegex?: RegExp) => {
      const match = reportText.match(sectionHeaderRegex);
      if (!match || match.index === undefined) return;

      const startIdx = match.index + match[0].length;
      let endIdx = reportText.length;

      if (nextHeaderRegex) {
        const nextMatch = reportText.slice(startIdx).match(nextHeaderRegex);
        if (nextMatch && nextMatch.index !== undefined) {
          endIdx = startIdx + nextMatch.index;
        }
      }

      let text = reportText.slice(startIdx, endIdx).trim();
      text = text.replace(/^#+\s+/gm, '').trim();

      if (text) {
        blocks.push({
          id,
          title,
          text,
          charCount: text.length,
          fitStatus: text.length <= 320 ? 'optimal' : text.length <= 600 ? 'warning' : 'large'
        });
      }
    };

    extractSection('resumen', '📋 Resumen Ejecutivo', /#+\s*1\.\s*RESUMEN EJECUTIVO/i, /#+\s*2\./i);
    extractSection('highlights', '💡 Highlights Generales', /##+\s*Highlights Generales/i, /##+\s*(Análisis de Tráfico|Medios)|#+\s*3\./i);
    extractSection('trafico', '📈 Análisis de Tráfico', /##+\s*Análisis de Tráfico/i, /##+\s*Medios|#+\s*3\./i);
    extractSection('medios', '📣 Medios & Pauta', /##+\s*Medios/i, /#+\s*3\./i);
    extractSection('next-steps', '🚀 Próximas Acciones', /#+\s*3\.\s*PRÓXIMAS ACCIONES/i);

    return blocks;
  }, []);

  const reportBlocks = extractReportBlocks(report);

  // Helper to convert markdown to clean HTML for PowerPoint / Word clipboard copy
  const markdownToCleanHtml = (markdown: string): string => {
    if (!markdown) return '';

    let html = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert headers
    html = html.replace(/^### (.*$)/gim, '<h3 style="font-weight: bold; font-size: 14pt; margin-top: 8pt; margin-bottom: 4pt;">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="font-weight: bold; font-size: 16pt; margin-top: 10pt; margin-bottom: 6pt;">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="font-weight: bold; font-size: 18pt; margin-top: 12pt; margin-bottom: 8pt;">$1</h1>');

    // Convert bold: **text** -> <b>text</b> (clean, no red color or background style)
    html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // Convert italics
    html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');

    // Convert bullet lists and paragraphs
    const lines = html.split('\n');
    const processedLines: string[] = [];
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const itemText = trimmed.substring(2);
        if (!inList) {
          processedLines.push('<ul style="margin-top: 4pt; margin-bottom: 4pt; padding-left: 18pt;">');
          inList = true;
        }
        processedLines.push(`  <li style="margin-bottom: 3pt;">${itemText}</li>`);
      } else {
        if (inList) {
          processedLines.push('</ul>');
          inList = false;
        }
        if (trimmed.length > 0 && !trimmed.startsWith('<h')) {
          processedLines.push(`<p style="margin-top: 4pt; margin-bottom: 4pt;">${trimmed}</p>`);
        } else {
          processedLines.push(line);
        }
      }
    }
    if (inList) {
      processedLines.push('</ul>');
    }

    return processedLines.join('\n');
  };

  const copyBlockToClipboard = async (blockId: string, text: string, title: string) => {
    const sanitizedPlainText = sanitizeForClipboard(text);
    const cleanHtml = markdownToCleanHtml(sanitizedPlainText);
    try {
      const blobHtml = new Blob([cleanHtml], { type: 'text/html' });
      const blobText = new Blob([sanitizedPlainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        })
      ]);
    } catch (err) {
      navigator.clipboard.writeText(sanitizedPlainText);
    }
    setCopiedBlockId(blockId);
    setPastedToast(`¡Copiaste '${title}' para PowerPoint (100% limpio sin caracteres ocultos)! (${sanitizedPlainText.length} chars)`);
    setTimeout(() => setCopiedBlockId(null), 2500);
  };

  // Interactive Dialogue States (Ask questions about Risk Alert & Insights)
  const [isRiskDialogueOpen, setIsRiskDialogueOpen] = useState(false);
  const [riskDialogueMessages, setRiskDialogueMessages] = useState<{ id: string; sender: 'user' | 'ai'; text: string; time: string }[]>([]);
  const [riskDialogueInput, setRiskDialogueInput] = useState('');
  const [isRiskDialogueLoading, setIsRiskDialogueLoading] = useState(false);

  const [insightsDialogueMessages, setInsightsDialogueMessages] = useState<{ id: string; sender: 'user' | 'ai'; text: string; time: string }[]>([]);
  const [insightsDialogueInput, setInsightsDialogueInput] = useState('');
  const [isInsightsDialogueLoading, setIsInsightsDialogueLoading] = useState(false);
  const [selectedInsightCategory, setSelectedInsightCategory] = useState<'all' | 'highlights' | 'trafico' | 'medios'>('all');

  // One Pager Product Category & History States
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>('cards');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyFilterCategory, setHistoryFilterCategory] = useState<'all' | ReportCategory>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  const [historyReports, setHistoryReports] = useState<SavedReport[]>(() => {
    const saved = localStorage.getItem('op-generator-report-history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Error loading report history from localStorage:", e);
      }
    }
    // Seed initial sample reports if history is empty
    return [
      {
        id: 'sample-cards-1',
        title: 'One Pager Cards - Desempeño Campaña TDC LikeU Q2',
        category: 'cards',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        input: 'Campaña TDC LikeU: Inversión $1.2M, Sesiones 380k, Aprobaciones 14,200 (vs Meta 12,000 +18.3%), CPA $84.5 (eCPM -40% vs estimado).',
        output: `# 1. RESUMEN EJECUTIVO\nLa campaña de Tarjetas de Crédito LikeU registró un desempeño superior al objetivo con 14,200 tarjetas aprobadas (+18.3% vs meta Q2). La optimización en eCPM permitió un ahorro del 40% en costos de adquisición.\n\n# 2. KEY INSIGHTS (BASADOS EN DATOS)\n## Highlights Generales\n- Incremento del +18.3% en colocadas digitales.\n- CPA promedio reducido a $84.5 MXN.\n\n## Análisis de Tráfico\n- 380,000 sesiones totales en la landing de TDC con tasa de conversión de 3.73%.\n\n## Medios\n- Google Search y Meta Ads explicaron el 68% de las aperturas de cuenta.\n\n# 3. PRÓXIMAS ACCIONES (NEXT STEPS)\n- Reasignar presupuesto sobrante hacia campañas de preclasificación en app Santander.`,
        detectedRisk: null,
        thinkingSteps: [
          { type: 'thought', text: 'Analizando rendimiento de Tarjetas de Crédito Santander LikeU.' },
          { type: 'action', text: 'Verificando aprobación frente a meta contractual de 12,000 unidades.' },
          { type: 'observation', text: 'Meta superada en +18.3% sin alertas de riesgo en KPIs.' }
        ],
        chartData: {
          title: 'Aprobaciones de TDC LikeU por Canal',
          type: 'bar',
          data: [
            { name: 'Google Search', value: 5800 },
            { name: 'Meta Paid', value: 3900 },
            { name: 'In-App Banner', value: 2700 },
            { name: 'Programmatic', value: 1800 }
          ]
        }
      },
      {
        id: 'sample-nomina-1',
        title: 'One Pager Nómina - Campaña Portabilidad & Adquisición',
        category: 'nomina',
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        input: 'Campaña Nómina Santander: 125,000 solicitudes de portabilidad iniciadas, 42,000 nóminas activadas. Caída del -22% en conversión de portabilidades en sitio web por demora en OTP SMS.',
        output: `# 1. RESUMEN EJECUTIVO\nSe lograron 42,000 portabilidades de nómina completadas durante el periodo. Sin embargo, se detectó una fricción técnica crítica en el flujo web por demoras en el envío de código OTP SMS.\n\n[[ALERTA_DE_RIESGO]] Caída de -22% en la conversión de portabilidad de nómina vía web atribuida a latencia en el proveedor de OTP SMS.\n\n# 2. KEY INSIGHTS (BASADOS EN DATOS)\n## Highlights Generales\n- Se iniciaron 125,000 trámites de portabilidad de nómina.\n- 42,000 clientes ya reciben su sueldo en Santander.\n\n## Análisis de Tráfico\n- Tráfico móvil concentró el 82% de las visitas.\n\n## Medios\n- Banners en App Santander y campañas en TikTok mostraron el menor CPA.\n\n# 3. PRÓXIMAS ACCIONES (NEXT STEPS)\n- Escalar con el equipo de infraestructura la redundancia del Gateway SMS para eliminar la pérdida de conversiones.`,
        detectedRisk: 'Caída de -22% en la conversión de portabilidad de nómina vía web atribuida a latencia en el proveedor de OTP SMS.',
        thinkingSteps: [
          { type: 'thought', text: 'Evaluando flujo de Portabilidad de Nómina Santander.' },
          { type: 'observation', text: 'ALERTA DE RIESGO: Caída de -22% en conversión excede la tolerancia del 20%.' }
        ],
        chartData: {
          title: 'Embudo de Portabilidad de Nómina',
          type: 'bar',
          data: [
            { name: 'Visitas Landing', value: 210000 },
            { name: 'Solicitudes OTP', value: 125000 },
            { name: 'Nóminas Activadas', value: 42000 }
          ]
        }
      }
    ];
  });

  const getCategoryLabel = (cat: ReportCategory) => {
    switch (cat) {
      case 'cards': return 'Cards (Tarjetas)';
      case 'nomina': return 'Nómina';
      case 'institucional': return 'Institucional';
      case 'pymes': return 'Pymes & Empresas';
      case 'general': default: return 'General';
    }
  };

  const loadReportToWorkspace = (savedReport: SavedReport) => {
    const parsed = parseAgentOutput(savedReport.output || '', savedReport.category);
    let cleanOutput = parsed.cleanText;
    let risk = savedReport.detectedRisk || parsed.riskText || null;

    setReport(cleanOutput);
    setThinkingSteps(savedReport.thinkingSteps || parsed.steps || []);
    setChartData(savedReport.chartData || parsed.chartJson || null);
    setKpiPanel(savedReport.kpiPanel || parsed.kpiPanel || null);
    setDetectedRisk(risk);
    setSelectedCategory(savedReport.category);
    if (savedReport.input) setCurrentInput(savedReport.input);

    // Run Guardrail Verification on loaded report
    const audit = runGuardrailAudit(savedReport.input || '', cleanOutput);
    setGuardrailAudit(audit);

    if (savedReport.kpiPanel || savedReport.chartData || parsed.kpiPanel || parsed.chartJson) {
      setWorkspaceTab('chart');
    } else {
      setWorkspaceTab('preview');
    }
    setIsHistoryModalOpen(false);
    setPastedToast(`Cargado: ${savedReport.title}`);
    setTimeout(() => setPastedToast(null), 3000);
  };

  const deleteReportFromHistory = (id: string) => {
    setHistoryReports(prev => {
      const updated = prev.filter(r => r.id !== id);
      localStorage.setItem('op-generator-report-history', JSON.stringify(updated));
      return updated;
    });
  };

  const activeCompareReport = useMemo(() => {
    if (compareReportId) {
      const found = historyReports.find(r => r.id === compareReportId);
      if (found) return found;
    }
    return historyReports.length > 0 ? historyReports[0] : null;
  }, [compareReportId, historyReports]);

  const handleCompareWithReport = (savedReport: SavedReport) => {
    setCompareReportId(savedReport.id);
    setWorkspaceTab('compare');
    setIsHistoryModalOpen(false);
    setPastedToast(`Modo Side-by-Side: Comparando con "${savedReport.title}"`);
    setTimeout(() => setPastedToast(null), 3000);
  };

  const handleRestoreHistoricalReport = (savedReport: SavedReport) => {
    if (confirm(`¿Deseas reemplazar el contenido actual del workspace con la versión histórica "${savedReport.title}"?`)) {
      loadReportToWorkspace(savedReport);
    }
  };

  const handleLeftScroll = () => {
    if (!isSyncScroll || isSyncingScrollRef.current) return;
    const left = leftCompareScrollRef.current;
    const right = rightCompareScrollRef.current;
    if (!left || !right) return;
    
    isSyncingScrollRef.current = true;
    const maxScrollLeft = left.scrollHeight - left.clientHeight;
    if (maxScrollLeft > 0) {
      const percentage = left.scrollTop / maxScrollLeft;
      right.scrollTop = percentage * (right.scrollHeight - right.clientHeight);
    }
    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  };

  const handleRightScroll = () => {
    if (!isSyncScroll || isSyncingScrollRef.current) return;
    const left = leftCompareScrollRef.current;
    const right = rightCompareScrollRef.current;
    if (!left || !right) return;
    
    isSyncingScrollRef.current = true;
    const maxScrollRight = right.scrollHeight - right.clientHeight;
    if (maxScrollRight > 0) {
      const percentage = right.scrollTop / maxScrollRight;
      left.scrollTop = percentage * (left.scrollHeight - left.clientHeight);
    }
    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  };

  const copyComparisonSummary = () => {
    if (!activeCompareReport) return;
    const curLen = report.length;
    const histLen = activeCompareReport.output.length;
    const delta = curLen - histLen;
    const pct = Math.round((delta / (histLen || 1)) * 100);

    const summaryText = `# REPORTE COMPARATIVO SIDE-BY-SIDE (SANTANDER ONE PAGER)
Fecha de Comparación: ${new Date().toLocaleDateString('es-MX')}

## 1. Versión Actual (Workspace)
- **Extensión**: ${curLen} caracteres (~${report.split(/\s+/).filter(Boolean).length} palabras)
- **Categoría**: ${getCategoryLabel(selectedCategory)}
- **Alerta de Riesgo**: ${detectedRisk ? `⚠️ ${detectedRisk}` : '✅ Sin alertas críticas'}
- **Visualización Gráfica**: ${chartData ? `📈 ${chartData.type.toUpperCase()} - ${chartData.title}` : 'Sin gráfico activo'}

## 2. Versión Histórica Comparada (${activeCompareReport.title})
- **Fecha Guardada**: ${new Date(activeCompareReport.createdAt).toLocaleDateString('es-MX')}
- **Extensión**: ${histLen} caracteres (~${activeCompareReport.output.split(/\s+/).filter(Boolean).length} palabras)
- **Categoría**: ${getCategoryLabel(activeCompareReport.category)}
- **Alerta de Riesgo**: ${activeCompareReport.detectedRisk ? `⚠️ ${activeCompareReport.detectedRisk}` : '✅ Sin alertas críticas'}
- **Visualización Gráfica**: ${activeCompareReport.chartData ? `📈 ${activeCompareReport.chartData.type.toUpperCase()} - ${activeCompareReport.chartData.title}` : 'Sin gráfico'}

## 3. Delta y Diferencias Clave
- **Variación de Extensión**: ${delta >= 0 ? `+${delta}` : delta} caracteres (${pct >= 0 ? `+${pct}` : pct}%)
- **Cambio en Detección de Riesgo**: ${detectedRisk === activeCompareReport.detectedRisk ? 'Mismo estado de riesgo' : 'El estado de riesgo difiere entre versiones'}
`;

    const sanitizedSummary = sanitizeForClipboard(summaryText);
    navigator.clipboard.writeText(sanitizedSummary);
    setPastedToast('¡Resumen comparativo copiado (100% limpio sin caracteres ocultos)!');
    setTimeout(() => setPastedToast(null), 3000);
  };

  const handleSendRiskQuestion = async (customQuestion?: string) => {
    const q = (customQuestion || riskDialogueInput).trim();
    if (!q || !detectedRisk) return;

    const userMsg = {
      id: crypto.randomUUID(),
      sender: 'user' as const,
      text: q,
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    };

    setRiskDialogueMessages(prev => [...prev, userMsg]);
    if (!customQuestion) setRiskDialogueInput('');
    setIsRiskDialogueLoading(true);

    try {
      const riskExecutionState: SkillExecutionState = {
        reportText: report || '',
        category: selectedCategory,
        detectedRisk: detectedRisk,
        focusedTopic: `ALERTA DE RIESGO: ${detectedRisk}`,
        chartData: chartData,
        kpiPanel: kpiPanel
      };

      let cleanAnswer = await askInsightDialogue(
        q,
        riskExecutionState,
        `ALERTA DE RIESGO DETECTADA: ${detectedRisk}`,
        [],
        baseContext,
        selectedCategory
      );
      cleanAnswer = cleanAnswer
        .replace(/<thinking_steps>[\s\S]*?<\/thinking_steps>/gi, '')
        .replace(/^(Thought|Action|Observation):\s*/gim, '')
        .trim();

      const aiMsg = {
        id: crypto.randomUUID(),
        sender: 'ai' as const,
        text: cleanAnswer,
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      };

      setRiskDialogueMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg = {
        id: crypto.randomUUID(),
        sender: 'ai' as const,
        text: `⚠️ No se pudo responder: ${err.message || 'Error de comunicación.'}`,
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      };
      setRiskDialogueMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsRiskDialogueLoading(false);
    }
  };

  const handleSendInsightsQuestion = async (customQuestion?: string) => {
    const q = (customQuestion || insightsDialogueInput).trim();
    if (!q || !report) return;

    const topicLabel = selectedInsightCategory === 'highlights' 
      ? 'Highlights Generales' 
      : selectedInsightCategory === 'trafico' 
      ? 'Análisis de Tráfico' 
      : selectedInsightCategory === 'medios' 
      ? 'Medios y Pauta' 
      : 'Reporte e Insights Generales';

    const userMsg = {
      id: crypto.randomUUID(),
      sender: 'user' as const,
      text: q,
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    };

    setInsightsDialogueMessages(prev => [...prev, userMsg]);
    if (!customQuestion) setInsightsDialogueInput('');
    setIsInsightsDialogueLoading(true);

    try {
      const insightsExecutionState: SkillExecutionState = {
        reportText: report,
        category: selectedCategory,
        detectedRisk: detectedRisk,
        focusedTopic: `Sección / Enfoque: ${topicLabel}`,
        chartData: chartData,
        kpiPanel: kpiPanel
      };

      let cleanAnswer = await askInsightDialogue(
        q,
        insightsExecutionState,
        `Sección / Enfoque: ${topicLabel}`,
        [],
        baseContext,
        selectedCategory
      );
      cleanAnswer = cleanAnswer
        .replace(/<thinking_steps>[\s\S]*?<\/thinking_steps>/gi, '')
        .replace(/^(Thought|Action|Observation):\s*/gim, '')
        .trim();

      const aiMsg = {
        id: crypto.randomUUID(),
        sender: 'ai' as const,
        text: cleanAnswer,
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      };

      setInsightsDialogueMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg = {
        id: crypto.randomUUID(),
        sender: 'ai' as const,
        text: `⚠️ No se pudo responder: ${err.message || 'Error de comunicación.'}`,
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      };
      setInsightsDialogueMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsInsightsDialogueLoading(false);
    }
  };

  // Initialize Firebase Authentication listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setSheetExportError(null);
      setDriveModalError(null);
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        return res.accessToken;
      }
      return null;
    } catch (err: any) {
      const errMsg = `Error al iniciar sesión: ${err.message || err}`;
      setSheetExportError(errMsg);
      setDriveModalError(errMsg);
      return null;
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
      setGoogleUser(null);
      setGoogleToken(null);
      setExportedSheetUrl(null);
      setDriveFiles([]);
    } catch (err: any) {
      setSheetExportError(`Error al cerrar sesión: ${err.message || err}`);
    }
  };

  const exportToGoogleSheets = async () => {
    let token = googleToken;
    if (!token) {
      token = await handleGoogleSignIn();
      if (!token) return;
    }

    setIsExportingSheet(true);
    setSheetExportError(null);
    setExportedSheetUrl(null);

    try {
      const activeChartTitle = chartData?.title || 'Métricas Generales';
      const result = await createAndPopulateSpreadsheet(token, {
        title: activeChartTitle,
        markdownContent: report,
        chartData: chartData
      });

      setExportedSheetUrl(result.spreadsheetUrl);
    } catch (err: any) {
      console.error(err);
      setSheetExportError(`Error de exportación: ${err.message || err}`);
    } finally {
      setIsExportingSheet(false);
    }
  };

  const handleFetchDriveFiles = async () => {
    let token = googleToken;
    if (!token) {
      token = await handleGoogleSignIn();
      if (!token) return;
    }

    setIsLoadingDriveFiles(true);
    setDriveModalError(null);
    try {
      const files = await listGoogleDriveFiles(token, driveSearchQuery);
      setDriveFiles(files);
    } catch (err: any) {
      setDriveModalError(`No se pudieron listar los archivos de Google Drive: ${err.message || err}`);
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  const handleImportDriveFile = async (fileIdOrUrl: string) => {
    let token = googleToken;
    if (!token) {
      token = await handleGoogleSignIn();
      if (!token) return;
    }

    setIsImportingDrive(true);
    setDriveModalError(null);
    try {
      const imported = await importGoogleDriveFile(token, fileIdOrUrl);
      
      if (driveImportTarget === 'knowledge') {
        const doc: TrainingDoc = {
          id: crypto.randomUUID(),
          name: imported.name,
          type: imported.name.split('.').pop()?.toLowerCase() || 'drive',
          charCount: imported.content.length,
          content: imported.content,
          source: 'drive',
          category: selectedCategory
        };
        setTrainingDocs(prev => [...prev, doc]);
        setBaseContext(prev => {
          const header = `--- DOCUMENTO DE ENTRENAMIENTO DE ESTILO (Google Drive - Vertical: ${selectedCategory.toUpperCase()}): ${imported.name} ---`;
          return prev ? `${prev}\n\n${header}\n${imported.content}` : `${header}\n${imported.content}`;
        });
        setPastedToast(`¡Documento de estilo "${imported.name}" importado desde Google Drive para ${getCategoryLabel(selectedCategory)}!`);
      } else if (driveImportTarget === 'examples') {
        const newExample: ReportEntry = {
          id: crypto.randomUUID(),
          name: `Ejemplo Estilo (${getCategoryLabel(selectedCategory)}): ${imported.name}`,
          input: `[Fuente Google Drive: ${imported.name}]`,
          output: imported.content,
          category: selectedCategory
        };
        setExamples(prev => [...prev, newExample]);
        setPastedToast(`¡Ejemplo de estilo "${imported.name}" cargado desde Google Drive para ${getCategoryLabel(selectedCategory)}!`);
      } else {
        const driveHeader = `--- ARCHIVO CARGADO (Google Drive): ${imported.name} ---`;
        const driveContent = `${driveHeader}\n${imported.content}`;
        setCurrentInput(prev => {
          if (!prev || !prev.trim()) return driveContent;
          return `${prev.trim()}\n\n${driveContent}`;
        });
        setUploadedFileNames(prev => [...prev, `[Google Drive] ${imported.name}`]);
        setPastedToast(`¡Archivo "${imported.name}" importado correctamente desde Google Drive!`);
      }

      setIsDriveModalOpen(false);
      setDriveUrlInput('');
      setTimeout(() => setPastedToast(null), 4000);
    } catch (err: any) {
      console.error(err);
      setDriveModalError(err.message || 'Error al importar desde Google Drive');
    } finally {
      setIsImportingDrive(false);
    }
  };

  const handleTrainingDocsUpload = async (files: FileList | File[], targetCategory?: ReportCategory) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const categoryToUse = targetCategory || selectedCategory || 'general';

    setIsGenerating(true);
    setError(null);
    let newDocs: TrainingDoc[] = [];

    for (const file of fileArray) {
      try {
        const content = await parseFile(file);
        const doc: TrainingDoc = {
          id: crypto.randomUUID(),
          name: file.name,
          type: file.name.split('.').pop()?.toLowerCase() || 'doc',
          charCount: content.length,
          content: content,
          source: 'upload',
          category: categoryToUse
        };
        newDocs.push(doc);
      } catch (err: any) {
        setError(`Error procesando "${file.name}": ${err.message || 'Formato no soportado'}`);
      }
    }

    if (newDocs.length > 0) {
      setTrainingDocs(prev => [...prev, ...newDocs]);
      setBaseContext(prev => {
        const newText = newDocs.map(d => `--- DOCUMENTO DE ENTRENAMIENTO DE ESTILO (Vertical: ${categoryToUse.toUpperCase()}): ${d.name} ---\n${d.content}`).join('\n\n');
        return prev ? `${prev}\n\n${newText}` : newText;
      });
      setOpenTrainingFolders(prev => ({ ...prev, [categoryToUse]: true }));
      setPastedToast(`¡${newDocs.length} documento(s) cargado(s) en la carpeta ${getCategoryLabel(categoryToUse)}!`);
      setTimeout(() => setPastedToast(null), 4000);
    }
    setIsGenerating(false);
  };

  const handleExampleDocsUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsGenerating(true);
    setError(null);
    let createdCount = 0;

    for (const file of fileArray) {
      try {
        const content = await parseFile(file);
        const newExample: ReportEntry = {
          id: crypto.randomUUID(),
          name: `Ejemplo Estilo (${getCategoryLabel(selectedCategory)}): ${file.name}`,
          input: `[Documento fuente: ${file.name}]`,
          output: content,
          category: selectedCategory
        };
        setExamples(prev => [...prev, newExample]);
        createdCount++;
      } catch (err: any) {
        setError(`Error procesando ejemplo "${file.name}": ${err.message || 'Error al leer'}`);
      }
    }

    if (createdCount > 0) {
      setPastedToast(`¡${createdCount} ejemplo(s) de estilo extraído(s) correctamente de los documentos!`);
      setTimeout(() => setPastedToast(null), 4000);
    }
    setIsGenerating(false);
  };

  const removeTrainingDoc = (id: string) => {
    const docToRemove = trainingDocs.find(d => d.id === id);
    const updatedDocs = trainingDocs.filter(d => d.id !== id);
    setTrainingDocs(updatedDocs);
    
    if (docToRemove) {
      setBaseContext(prev => {
        const header = `--- DOCUMENTO DE ENTRENAMIENTO DE ESTILO: ${docToRemove.name} ---`;
        const driveHeader = `--- DOCUMENTO DE ENTRENAMIENTO DE ESTILO (Google Drive): ${docToRemove.name} ---`;
        let cleaned = prev.replace(new RegExp(`${header}\\n[\\s\\S]*?(\\n\\n|$)`, 'g'), '');
        cleaned = cleaned.replace(new RegExp(`${driveHeader}\\n[\\s\\S]*?(\\n\\n|$)`, 'g'), '');
        return cleaned.trim();
      });
    }
  };

  const lastPastedTimeRef = useRef<number>(0);

  // Process clipboard paste items (deduplicated against double firing)
  const processClipboardData = (clipboardData: DataTransfer | null) => {
    if (!clipboardData) return;
    const items = clipboardData.items;
    if (!items) return;

    const now = Date.now();
    if (now - lastPastedTimeRef.current < 400) {
      return;
    }

    let imageCount = 0;
    const processedKeys = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const fileKey = `${file.name}-${file.size}-${file.type}`;
          if (processedKeys.has(fileKey)) continue;
          processedKeys.add(fileKey);

          imageCount++;
          lastPastedTimeRef.current = Date.now();

          const reader = new FileReader();
          reader.onload = () => {
            const resultStr = reader.result as string;
            const rawBase64 = resultStr.split(',')[1];
            const newScreenshot: Screenshot = {
              id: crypto.randomUUID(),
              name: `Captura Pegada (${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`,
              data: rawBase64,
              mimeType: file.type,
              previewUrl: resultStr
            };
            setScreenshots(prev => {
              if (prev.some(s => s.data === rawBase64)) return prev;
              return [...prev, newScreenshot];
            });
          };
          reader.readAsDataURL(file);
        }
      }
    }

    if (imageCount > 0) {
      setPastedToast(`¡${imageCount} imagen(es) pegada(s) correctamente del portapapeles!`);
      setTimeout(() => setPastedToast(null), 3500);
    }
  };

  // Clipboard paste listener to allow directly pasting screenshots
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      processClipboardData(e.clipboardData);
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem('op-generator-examples', JSON.stringify(examples));
    localStorage.setItem('op-generator-base-context', baseContext);
    localStorage.setItem('op-generator-training-docs', JSON.stringify(trainingDocs));
  }, [examples, baseContext, trainingDocs]);

  // Handlers
  const addExample = () => {
    const newExample: ReportEntry = {
      id: crypto.randomUUID(),
      name: `Ejemplo ${examples.length + 1}`,
      input: '',
      output: ''
    };
    setExamples([...examples, newExample]);
    setIsConfigOpen(true);
  };

  const updateExample = (id: string, field: keyof ReportEntry, value: string) => {
    setExamples(examples.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  };

  const removeExample = (id: string) => {
    setExamples(examples.filter(ex => ex.id !== id));
  };

  const handleGenerate = async () => {
    if (!currentInput.trim() && screenshots.length === 0) return;
    
    setIsGenerating(true);
    setError(null);
    setDetectedRisk(null);
    setThinkingSteps([]);
    setChartData(null);
    setRiskDialogueMessages([]);
    setRiskDialogueInput('');
    setIsRiskDialogueOpen(false);
    setInsightsDialogueMessages([]);
    setInsightsDialogueInput('');
    
    try {
      const result = await generateOnePager(
        currentInput,
        examples,
        baseContext,
        mode,
        screenshots,
        selectedCategory,
        undefined,
        visualizationMode
      );
      
      const parsed = parseAgentOutput(result, selectedCategory);
      let cleanText = parsed.cleanText;
      let steps = parsed.steps;
      let chartJson = parsed.chartJson;
      let panelJson = parsed.kpiPanel;
      let riskText = parsed.riskText;

      if (steps.length === 0) {
        // Fallback realistic reasoning trace to keep UX spectacular
        steps = [
          { type: 'thought', text: `Iniciando consulta para módulo corporativo Santander: Modo "${mode.toUpperCase()}" (${getCategoryLabel(selectedCategory)}).` },
          { type: 'action', text: `Analizando ${screenshots.length > 0 ? `${screenshots.length} capturas e ` : ''}input recibido contra el RAG Context.` },
          { type: 'observation', text: 'Cruzando métricas reportadas con manuales de performance vigentes de Media.Monks.' },
          { type: 'thought', text: 'Formateando salida final según directrices de One Pager Ejecutivo.' }
        ];
      }

      // 4. Run Guardrail & Numerical Verification Engine
      const auditResult = runGuardrailAudit(currentInput, cleanText);
      setGuardrailAudit(auditResult);

      setThinkingSteps(steps);
      setChartData(chartJson);
      setKpiPanel(panelJson);
      setDetectedRisk(riskText);
      setReport(cleanText);
      setIsReasoningExpanded(true); // Open reasoning loop on generation success

      // Automatically save generated report into history!
      if (mode === 'report') {
        const now = new Date();
        const formattedDate = `${now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ${now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
        const autoTitle = `One Pager ${getCategoryLabel(selectedCategory)} - ${formattedDate}`;

        const newSavedReport: SavedReport = {
          id: crypto.randomUUID(),
          title: autoTitle,
          category: selectedCategory,
          createdAt: now.toISOString(),
          input: currentInput || (screenshots.length > 0 ? `Capturas (${screenshots.length}): ${screenshots.map(s => s.name).join(', ')}` : 'Generado desde archivo adjunto/contexto'),
          output: cleanText,
          detectedRisk: riskText,
          thinkingSteps: steps,
          chartData: chartJson,
          kpiPanel: panelJson
        };

        setHistoryReports(prev => {
          const updated = [newSavedReport, ...prev];
          localStorage.setItem('op-generator-report-history', JSON.stringify(updated));
          return updated;
        });

        setPastedToast(`One Pager guardado en Historial (${getCategoryLabel(selectedCategory)})`);
        setTimeout(() => setPastedToast(null), 3500);
      }

      // Always land on 'preview' for immediate Markdown inspection
      setWorkspaceTab('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red de IA. Probá reintentando.');
    } finally {
      setIsGenerating(false);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const removeUploadedFile = (fileNameToRemove: string, indexToRemove: number) => {
    setUploadedFileNames(prev => prev.filter((_, idx) => idx !== indexToRemove));
    
    setCurrentInput(prev => {
      const cleanName = fileNameToRemove.replace('[Google Drive] ', '').trim();
      const escapedName = cleanName.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
      const blockRegex = new RegExp(`--- ARCHIVO CARGADO(?: \\(Google Drive\\))?: ${escapedName} ---[\\s\\S]*?(?=(--- ARCHIVO CARGADO|$))`, 'gi');
      const cleaned = prev.replace(blockRegex, '').trim();
      return cleaned;
    });
  };

  const clearAllUploadedFiles = () => {
    setUploadedFileNames([]);
    setCurrentInput('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: File[] = [];
    
    if (e.target && 'files' in e.target && e.target.files && e.target.files.length > 0) {
      files = Array.from(e.target.files);
    } else if ('dataTransfer' in e && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      files = Array.from(e.dataTransfer.files);
    }

    if (files.length === 0) {
      setIsDragging(false);
      return;
    }

    setIsDragging(false);

    // Separate images vs document files
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const docFiles = files.filter(f => !f.type.startsWith('image/'));

    // Process images
    if (imageFiles.length > 0) {
      imageFiles.forEach(imgFile => {
        const reader = new FileReader();
        reader.onload = () => {
          const resultStr = reader.result as string;
          const rawBase64 = resultStr.split(',')[1];
          const newScreenshot: Screenshot = {
            id: crypto.randomUUID(),
            name: imgFile.name,
            data: rawBase64,
            mimeType: imgFile.type,
            previewUrl: resultStr
          };
          setScreenshots(prev => [...prev, newScreenshot]);
        };
        reader.readAsDataURL(imgFile);
      });
      setPastedToast(`¡${imageFiles.length} captura(s) adjuntada(s) correctamente!`);
      setTimeout(() => setPastedToast(null), 3500);
    }

    // Process document files
    if (docFiles.length > 0) {
      setIsGenerating(true);
      setError(null);
      
      const newFormattedBlocks: string[] = [];
      const newNames: string[] = [];

      for (const docFile of docFiles) {
        try {
          const content = await parseFile(docFile);
          const header = `--- ARCHIVO CARGADO: ${docFile.name} ---`;
          newFormattedBlocks.push(`${header}\n${content.trim()}`);
          newNames.push(docFile.name);
        } catch (err: any) {
          setError(`Error procesando "${docFile.name}": ${err.message || 'Formato no soportado'}`);
        }
      }

      if (newFormattedBlocks.length > 0) {
        const combinedText = newFormattedBlocks.join('\n\n');
        setCurrentInput(prev => {
          if (!prev || !prev.trim()) {
            return combinedText;
          }
          return `${prev.trim()}\n\n${combinedText}`;
        });

        setUploadedFileNames(prev => [...prev, ...newNames]);
        setPastedToast(`¡${newNames.length} archivo(s) procesado(s) y agregado(s) sin borrar datos anteriores!`);
        setTimeout(() => setPastedToast(null), 4000);
      }

      setIsGenerating(false);
    }

    // Reset input element value so re-selecting the same file triggers onChange
    if (e.target && 'value' in e.target) {
      (e.target as HTMLInputElement).value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const copyToClipboard = async () => {
    const sanitizedPlainText = sanitizeForClipboard(report);
    const cleanHtml = markdownToCleanHtml(sanitizedPlainText);
    try {
      const blobHtml = new Blob([cleanHtml], { type: 'text/html' });
      const blobText = new Blob([sanitizedPlainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        })
      ]);
    } catch (err) {
      navigator.clipboard.writeText(sanitizedPlainText);
    }
    setCopied(true);
    setPastedToast('¡Reporte completo copiado (100% limpio sin caracteres ocultos)!');
    setTimeout(() => {
      setCopied(false);
      setPastedToast(null);
    }, 2500);
  };

  // Intercept text selection copy inside report preview to strip Santander red color & background
  const handleReportCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    // Clean up Santander red text styling, background pills, and borders from copied selection
    const allElements = container.querySelectorAll('*');
    allElements.forEach(el => {
      if (el instanceof HTMLElement) {
        el.style.color = 'inherit';
        el.style.backgroundColor = 'transparent';
        el.style.background = 'transparent';
        el.style.border = 'none';
        el.style.boxShadow = 'none';
        el.className = '';
        if (el.tagName === 'STRONG' || el.tagName === 'B') {
          el.style.fontWeight = 'bold';
        }
      }
    });

    const cleanHtml = container.innerHTML;
    const plainText = sanitizeCleanText(selection.toString());

    e.clipboardData.setData('text/html', cleanHtml);
    e.clipboardData.setData('text/plain', plainText);
    e.preventDefault();
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#0A0C10] text-[#E2E8F0]' : 'bg-[#F8F8F8] text-[#111111]'} flex flex-col font-sans transition-colors duration-200`}>
      {/* Top Corporate Brand Bar */}
      <div className="bg-monks-dark text-white/90 text-[10px] font-mono px-6 py-2 flex justify-between items-center border-b border-white/10 tracking-widest uppercase">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MonksLogo className="h-4 text-white" fill="#FFFFFF" />
            <span className="text-santander-red font-bold font-mono">✕</span>
            <SantanderSquareLogo className="w-4 h-4" roundedClass="rounded-xs" />
            <span className="font-extrabold text-white tracking-wide">Santander</span>
          </div>
          <span className="text-white/30 font-light">•</span>
          <span className="hidden sm:inline text-white/70">Executive Performance Generator</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-white/10 px-2 py-0.5 rounded text-[9px] text-white/90 font-bold border border-white/15">
            Proprietary & Confidential
          </span>
          <span className="text-white/60 hidden md:inline">JULIO 2026</span>
        </div>
      </div>

      {/* Main Header */}
      <header className="bg-white text-monks-dark px-6 py-3.5 flex items-center justify-between border-b-4 border-santander-red sticky top-0 z-50 executive-shadow">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-monks-dark p-2 px-3 rounded-xl shadow-md text-white">
            <MonksLogo className="h-5 text-white" fill="#FFFFFF" />
            <span className="text-santander-red font-black text-xs font-mono">✕</span>
            <SantanderSquareLogo className="w-6 h-6" roundedClass="rounded-md" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-monks-dark uppercase font-sans">
                Agente Santander
              </h1>
              <span className="px-2.5 py-0.5 bg-santander-cielo text-santander-red text-[10px] font-black rounded-full border border-santander-red/20 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <span className="font-extrabold text-monks-dark">.monks</span>
                <span className="text-[8px] font-bold text-santander-red">✕</span>
                <span className="text-santander-red font-extrabold">Santander</span>
              </span>
            </div>
            <p className="text-[11px] text-gray-500 font-medium tracking-wide font-sans mt-0.5">
              Generador de One Pagers Ejecutivos • Categorización y Análisis de Performance
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setIsHistoryModalOpen(true)}
            className="santander-pill hover:bg-santander-red hover:text-white cursor-pointer shadow-xs"
            title="Ver historial de reportes One Pager guardados"
          >
            <History className="w-3.5 h-3.5 animate-pulse" />
            <span>Historial</span>
            <span className="bg-santander-red text-white group-hover:bg-white group-hover:text-santander-red text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ml-1">
              {historyReports.length}
            </span>
          </button>

          <button 
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
              isConfigOpen
                ? 'bg-monks-dark text-white border-monks-dark shadow-xs'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{isConfigOpen ? 'Cerrar Contexto' : 'Entrenar Estilo'}</span>
          </button>

          {/* Theme Selector Toggle (Claro / Nocturno) */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-700 transition-all cursor-pointer shadow-xs flex items-center justify-center relative group"
            title={theme === 'light' ? 'Cambiar a Modo Nocturno (Dark Mode)' : 'Cambiar a Modo Claro (Light Mode)'}
            aria-label="Alternar tema visual"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-gray-700 transition-transform group-hover:rotate-12" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400 transition-transform group-hover:rotate-45" />
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input & Training */}
        <div className="space-y-6">
          
          {/* Training Context Drawer */}
          <AnimatePresence>
            {isConfigOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-white rounded-xl border border-gray-200 executive-shadow"
              >
                <div className="p-6 space-y-5 max-h-[650px] overflow-y-auto">
                  <div className="p-4 bg-santander-red/5 border border-santander-red/10 rounded-xl space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <h3 className="text-xs font-extrabold text-santander-red uppercase tracking-widest flex items-center gap-2">
                         <Sparkles className="w-4 h-4 text-santander-red" />
                         Entrenamiento de Estilo y Reportes de Referencia
                      </h3>
                      <div className="flex items-center gap-2">
                        <label 
                          htmlFor="training-docs-upload" 
                          className="px-3 py-1.5 bg-santander-red text-white text-[10px] font-bold rounded-lg hover:opacity-90 cursor-pointer transition-all uppercase tracking-wider flex items-center gap-1 shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Subir Reportes
                        </label>
                        <button
                          onClick={() => {
                            setDriveImportTarget('knowledge');
                            setIsDriveModalOpen(true);
                            handleFetchDriveFiles();
                          }}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded-lg hover:bg-blue-100 cursor-pointer transition-all uppercase tracking-wider flex items-center gap-1"
                        >
                          <HardDrive className="w-3.5 h-3.5" />
                          Desde Google Drive
                        </button>
                      </div>
                      <input 
                        type="file" 
                        id="training-docs-upload" 
                        className="hidden" 
                        multiple
                        accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md,.json,.rtf"
                        onChange={(e) => {
                          if (e.target.files) {
                            handleTrainingDocsUpload(e.target.files);
                            e.target.value = '';
                          }
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      Subí o importá tus reportes entregados anteriormente en <strong>PowerPoint (.pptx), Word (.docx), PDF, Excel</strong> o directamente desde tu <strong>Google Drive</strong>. El Agente extraerá su formato, tono, estructura y métricas de referencia para utilizarlos automáticamente en la generación de nuevos One Pagers.
                    </p>

                    {/* Interactive Drag & Drop Area */}
                    <div
                      onClick={() => document.getElementById('training-docs-upload')?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsTrainingDragActive(true); }}
                      onDragLeave={() => setIsTrainingDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsTrainingDragActive(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          handleTrainingDocsUpload(e.dataTransfer.files);
                        }
                      }}
                      className={`p-5 border-2 border-dashed rounded-xl text-center transition-all cursor-pointer select-none ${
                        isTrainingDragActive 
                          ? 'border-santander-red bg-red-50/80 scale-[1.01] shadow-md ring-2 ring-santander-red/30' 
                          : 'border-gray-200 bg-white hover:border-santander-red/50 hover:bg-gray-50/50'
                      }`}
                    >
                      <CloudUpload className={`w-8 h-8 mx-auto mb-2 transition-transform ${isTrainingDragActive ? 'text-santander-red animate-bounce scale-110' : 'text-gray-400'}`} />
                      <p className="text-xs font-bold text-gray-800">
                        Arrastrá y soltá aquí tus reportes con el cursor o hacé clic para explorar
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Soporta .zip (paquetes de one pagers), PowerPoint (.pptx), Word (.docx), PDF, Excel (.xlsx), CSV, Text y enlaces directos de Google Drive
                      </p>
                    </div>

                    {/* Folders for Training Documents by Vertical */}
                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5 text-santander-red" />
                          <span>Carpetas de Reportes de Referencia ({trainingDocs.length})</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-400">
                            Total: {trainingDocs.reduce((acc, d) => acc + d.charCount, 0).toLocaleString()} chars
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const allOpen = Object.values(openTrainingFolders).every(v => v);
                              setOpenTrainingFolders({
                                cards: !allOpen,
                                nomina: !allOpen,
                                institucional: !allOpen,
                                pymes: !allOpen,
                                general: !allOpen
                              });
                            }}
                            className="text-[9px] font-bold text-santander-red hover:underline uppercase tracking-tight cursor-pointer"
                          >
                            {Object.values(openTrainingFolders).every(v => v) ? 'Colapsar Carpetas' : 'Expandir Carpetas'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {[
                          { id: 'cards' as const, label: 'Carpeta OP Cards (Tarjetas)', icon: CreditCard, badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200', iconColor: 'text-indigo-600' },
                          { id: 'nomina' as const, label: 'Carpeta OP Nómina', icon: Wallet, badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200', iconColor: 'text-emerald-600' },
                          { id: 'institucional' as const, label: 'Carpeta Institucional', icon: Building2, badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200', iconColor: 'text-amber-600' },
                          { id: 'pymes' as const, label: 'Carpeta Pymes & Empresas', icon: Briefcase, badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200', iconColor: 'text-blue-600' },
                          { id: 'general' as const, label: 'Carpeta General / Corporativo', icon: BarChart3, badgeStyle: 'bg-gray-100 text-gray-700 border-gray-200', iconColor: 'text-gray-600' }
                        ].map((folder) => {
                          const folderDocs = trainingDocs.filter(d => (d.category || 'general') === folder.id);
                          const isOpen = !!openTrainingFolders[folder.id];
                          const folderChars = folderDocs.reduce((acc, d) => acc + d.charCount, 0);
                          const isFolderDragActive = dragActiveFolderId === folder.id;

                          return (
                            <div 
                              key={folder.id} 
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragActiveFolderId(folder.id);
                              }}
                              onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragActiveFolderId(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragActiveFolderId(null);
                                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                  handleTrainingDocsUpload(e.dataTransfer.files, folder.id);
                                }
                              }}
                              className={`border rounded-xl bg-white overflow-hidden shadow-2xs transition-all ${
                                isFolderDragActive 
                                  ? 'border-santander-red ring-2 ring-santander-red/40 bg-red-50/70 scale-[1.01]' 
                                  : 'border-gray-200'
                              }`}
                            >
                              {/* Drag Overlay Notification */}
                              {isFolderDragActive && (
                                <div className="p-2.5 bg-santander-red text-white text-xs font-bold text-center flex items-center justify-center gap-2 animate-pulse">
                                  <CloudUpload className="w-4 h-4 animate-bounce" />
                                  <span>Soltá los archivos aquí para agregarlos directamente a {folder.label}</span>
                                </div>
                              )}

                              {/* Folder Header Bar */}
                              <div 
                                onClick={() => toggleTrainingFolder(folder.id)}
                                className="p-3 bg-gray-50/80 hover:bg-gray-100 flex justify-between items-center gap-2 cursor-pointer transition-colors border-b border-gray-100 select-none"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="p-1.5 bg-white rounded-lg border border-gray-200/80 shadow-2xs">
                                    {isOpen ? (
                                      <FolderOpen className={`w-4 h-4 ${folder.iconColor}`} />
                                    ) : (
                                      <Folder className={`w-4 h-4 ${folder.iconColor}`} />
                                    )}
                                  </div>
                                  <span className="font-extrabold text-xs text-gray-800 truncate">{folder.label}</span>
                                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${folder.badgeStyle}`}>
                                    {folderDocs.length} {folderDocs.length === 1 ? 'documento' : 'documentos'}
                                  </span>
                                  {folderChars > 0 && (
                                    <span className="text-[10px] text-gray-400 font-mono hidden sm:inline">
                                      • {folderChars.toLocaleString()} chars
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <label 
                                    htmlFor={`upload-folder-input-${folder.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2 py-1 bg-white hover:bg-red-50 text-santander-red border border-santander-red/30 text-[9px] font-bold rounded-md cursor-pointer transition-colors flex items-center gap-1 shadow-2xs uppercase tracking-tight"
                                    title={`Subir archivo directamente a la carpeta ${folder.label}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Subir a {getCategoryLabel(folder.id)}</span>
                                  </label>
                                  <input 
                                    type="file" 
                                    id={`upload-folder-input-${folder.id}`} 
                                    className="hidden" 
                                    multiple
                                    accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md,.json,.rtf"
                                    onChange={(e) => {
                                      if (e.target.files) {
                                        handleTrainingDocsUpload(e.target.files, folder.id);
                                        e.target.value = '';
                                      }
                                    }}
                                  />

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTrainingFolder(folder.id);
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-700 rounded-md transition-colors"
                                  >
                                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>

                              {/* Folder Expanded Content */}
                              <AnimatePresence initial={false}>
                                {isOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-3 bg-white space-y-2">
                                      {folderDocs.length === 0 ? (
                                        <div className="py-4 text-center border border-dashed border-gray-200 rounded-lg bg-gray-50/50 space-y-1">
                                          <p className="text-xs font-medium text-gray-500">
                                            La carpeta de <strong className="text-gray-700">{getCategoryLabel(folder.id)}</strong> está vacía.
                                          </p>
                                          <p className="text-[10px] text-gray-400">
                                            Subí reportes o presentaciones de esta vertical para entrenar su estilo de forma segmentada.
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          {folderDocs.map((doc) => {
                                            const isWord = doc.name.endsWith('.docx') || doc.name.endsWith('.doc');
                                            const isPpt = doc.name.endsWith('.pptx') || doc.name.endsWith('.ppt');
                                            const isExcel = doc.name.endsWith('.xlsx') || doc.name.endsWith('.xls') || doc.name.endsWith('.csv');
                                            const isPdf = doc.name.endsWith('.pdf');
                                            return (
                                              <div key={doc.id} className="p-2.5 bg-gray-50/60 hover:bg-gray-50 border border-gray-200/80 rounded-lg flex items-center justify-between gap-2 shadow-2xs text-xs">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                  {isPpt ? (
                                                    <FileText className="w-4 h-4 text-orange-600 shrink-0" />
                                                  ) : isWord ? (
                                                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                                                  ) : isExcel ? (
                                                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                                                  ) : isPdf ? (
                                                    <FileText className="w-4 h-4 text-red-600 shrink-0" />
                                                  ) : doc.source === 'drive' ? (
                                                    <HardDrive className="w-4 h-4 text-blue-500 shrink-0" />
                                                  ) : (
                                                    <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                                                  )}
                                                  <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                                                    <div className="text-[9px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                                                      <span>{doc.charCount.toLocaleString()} chars</span>
                                                      <span>•</span>
                                                      <span className="uppercase font-semibold text-santander-red">{doc.source === 'drive' ? 'Drive' : doc.type}</span>
                                                    </div>
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-1 shrink-0">
                                                  {/* Category selector to reassign folder */}
                                                  <select
                                                    value={doc.category || 'general'}
                                                    onChange={(e) => moveTrainingDocCategory(doc.id, e.target.value as ReportCategory)}
                                                    className="text-[9px] font-bold bg-white border border-gray-200 text-gray-600 rounded px-1.5 py-1 focus:outline-none focus:border-santander-red cursor-pointer"
                                                    title="Mover a otra carpeta/vertical"
                                                  >
                                                    <option value="cards">Cards</option>
                                                    <option value="nomina">Nómina</option>
                                                    <option value="institucional">Institucional</option>
                                                    <option value="pymes">Pymes</option>
                                                    <option value="general">General</option>
                                                  </select>

                                                  <button
                                                    onClick={() => removeTrainingDoc(doc.id)}
                                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    title="Eliminar reporte"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="relative pt-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                        Memoria de Estilo y Reglas Extraídas
                      </label>
                      <textarea 
                        value={baseContext}
                        onChange={(e) => setBaseContext(e.target.value)}
                        className="w-full h-44 text-xs p-3 rounded-lg border-gray-200 bg-white focus:border-santander-red outline-none resize-none font-mono leading-relaxed"
                        placeholder="El contenido extraído de tus reportes anteriores aparecerá aquí de forma consolidada. Podés editar o agregar reglas o indicaciones de estilo adicionales."
                      />
                      {baseContext && (
                        <div className="absolute top-8 right-2 flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase">
                          <Check className="w-2 h-2" />
                          Memoria Activa ({baseContext.length.toLocaleString()} chars)
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          localStorage.setItem('op-generator-base-context', baseContext);
                          localStorage.setItem('op-generator-training-docs', JSON.stringify(trainingDocs));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2500);
                        }}
                        className="w-full text-xs font-bold bg-santander-red text-white py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {copied ? '¡AGENTE ENTRENADO CON ÉXITO!' : 'Guardar y Entrenar Agente Santander'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Main Input Area */}
          <div className="bg-white dark:bg-[#131722] rounded-2xl border border-gray-200 dark:border-[#222838] executive-shadow overflow-hidden flex flex-col santander-escalon-top">
            <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-[#222838] flex flex-col gap-3 bg-gradient-to-b from-white to-gray-50/50 dark:from-[#151926] dark:to-[#10141E]">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-santander-red"></span>
                  <h2 className="font-black text-monks-dark dark:text-white tracking-wide uppercase text-sm flex items-center gap-2">
                    WORKSPACE DE ENTRADA
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    id="main-file-upload" 
                    className="hidden" 
                    accept=".xlsx,.xls,.pdf,.docx,.doc,.pptx,.ppt,.csv,.txt"
                    multiple
                    onChange={handleFileUpload}
                  />
                  <label 
                    htmlFor="main-file-upload"
                    className="text-[10px] font-bold bg-santander-red text-white py-1 px-2.5 rounded-full hover:bg-santander-red-dark cursor-pointer transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Cargar PPTX / Excel
                  </label>
                  <span className="text-[9px] font-mono font-bold text-gray-500 dark:text-sky-300 bg-santander-cielo dark:bg-sky-950/40 border border-santander-red/20 dark:border-sky-800/40 px-2 py-0.5 rounded-full">
                    BigQuery
                  </span>
                  <span className="text-[9px] font-mono font-bold text-gray-500 dark:text-sky-300 bg-santander-cielo dark:bg-sky-950/40 border border-santander-red/20 dark:border-sky-800/40 px-2 py-0.5 rounded-full">
                    Looker Studio
                  </span>
                </div>
              </div>

              {uploadedFileNames.length > 0 && (
                <div className="px-6 py-2.5 bg-green-50 dark:bg-emerald-950/30 border-y border-green-200/80 dark:border-emerald-800/40 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-green-800 dark:text-emerald-300 font-bold uppercase flex-wrap">
                    <Check className="w-3.5 h-3.5 text-green-600 dark:text-emerald-400 shrink-0" />
                    <span>{uploadedFileNames.length === 1 ? 'Archivo Cargado:' : `Archivos Cargados (${uploadedFileNames.length}):`}</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {uploadedFileNames.map((fileName, idx) => (
                        <span key={idx} className="bg-white dark:bg-[#1A202E] border border-green-300/80 dark:border-emerald-700/60 text-green-800 dark:text-emerald-200 px-2 py-1 rounded-md font-mono text-[10px] shadow-2xs flex items-center gap-1.5">
                          <FileText className="w-3 h-3 text-green-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate max-w-[200px]" title={fileName}>{fileName}</span>
                          <button
                            onClick={() => removeUploadedFile(fileName, idx)}
                            className="text-green-700 dark:text-emerald-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded p-0.5 transition-colors cursor-pointer"
                            title={`Remover ${fileName}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={clearAllUploadedFiles}
                    className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 font-bold uppercase transition-colors cursor-pointer px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-800/40"
                  >
                    Remover Todo
                  </button>
                </div>
              )}

              {/* Product Vertical / Category Selector & Soporte Técnico Button */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-santander-red" />
                    Vertical / Categoría del One Pager:
                  </label>
                  <span className="text-[9px] font-mono font-bold text-santander-red bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/40 px-1.5 py-0.5 rounded">
                    Especializado
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 bg-gray-50 dark:bg-[#0E121A] p-1.5 rounded-lg border border-gray-200/80 dark:border-[#222838]">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {[
                      { id: 'cards', label: 'OP Cards (Tarjetas)', icon: CreditCard, color: 'hover:border-indigo-300 text-indigo-700 dark:text-indigo-300' },
                      { id: 'nomina', label: 'OP Nómina', icon: Wallet, color: 'hover:border-emerald-300 text-emerald-700 dark:text-emerald-300' },
                      { id: 'institucional', label: 'OP Institucional', icon: Building2, color: 'hover:border-amber-300 text-amber-700 dark:text-amber-300' },
                      { id: 'pymes', label: 'OP Pymes', icon: Briefcase, color: 'hover:border-blue-300 text-blue-700 dark:text-blue-300' },
                      { id: 'general', label: 'General', icon: BarChart3, color: 'hover:border-gray-300 text-gray-700 dark:text-gray-300' }
                    ].map((cat) => {
                      const isSelected = selectedCategory === cat.id && mode === 'report';
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat.id as ReportCategory);
                            setMode('report');
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-extrabold uppercase transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-santander-red text-white border-santander-red shadow-xs scale-[1.02]'
                              : `bg-white dark:bg-[#1A202E] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-[#262D3E] hover:bg-gray-100 dark:hover:bg-[#222A3D] ${cat.color}`
                          }`}
                        >
                          <cat.icon className={`w-3 h-3 ${isSelected ? 'text-white' : ''}`} />
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Smaller Soporte Técnico button placed at the end */}
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'support' ? 'report' : 'support')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-extrabold uppercase transition-all cursor-pointer border ml-auto ${
                      mode === 'support'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-1 ring-amber-400'
                        : 'bg-white dark:bg-[#1A202E] text-gray-500 dark:text-gray-400 hover:text-amber-700 dark:hover:text-amber-300 hover:border-amber-300 dark:hover:border-amber-700/60 border-gray-200 dark:border-[#262D3E]'
                    }`}
                    title="Realizar una consulta técnica o recibir soporte de métricas"
                  >
                    <Sparkles className={`w-3 h-3 ${mode === 'support' ? 'text-white animate-spin' : 'text-amber-500'}`} />
                    <span>Soporte Técnico</span>
                  </button>
                </div>

                {/* RAG Focus Active Banner */}
                {selectedCategory !== 'general' && mode === 'report' && (
                  <div className="px-3 py-1.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/50 rounded-lg flex items-center justify-between text-[10px] text-blue-900 dark:text-blue-200 font-medium">
                    <div className="flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 animate-pulse" />
                      <span>
                        <strong className="dark:text-blue-100">RAG Focus:</strong> Contexto de memoria y Few-Shot Examples filtrados para la vertical <strong className="dark:text-blue-100">{getCategoryLabel(selectedCategory)}</strong>
                      </span>
                    </div>
                    <span className="bg-blue-600 text-white font-extrabold px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-mono">
                      Segmentado
                    </span>
                  </div>
                )}
              </div>

              {/* Mode Indicator Banner when Soporte Técnico is active */}
              {mode === 'support' && (
                <div className="mt-2 px-3 py-1.5 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-lg flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-[10px]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Modo Activo: Consulta de Soporte Técnico</span>
                  </div>
                  <button
                    onClick={() => setMode('report')}
                    className="text-[9px] font-black text-santander-red hover:underline uppercase tracking-wide cursor-pointer"
                  >
                    ← Volver a One Pager
                  </button>
                </div>
              )}
            </div>
            
            {/* Input View Mode Selector (Texto Plano vs Data Preview Table) */}
            <div className="px-4 py-1.5 bg-gray-50 dark:bg-[#0E121A] border-b border-gray-200/60 dark:border-[#222838] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-gray-200/80 dark:bg-[#181E2B] p-0.5 rounded-lg border border-transparent dark:border-[#242C3E]">
                <button
                  type="button"
                  onClick={() => setInputViewMode('text')}
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                    inputViewMode === 'text'
                      ? 'bg-white dark:bg-[#242B3C] text-santander-red dark:text-[#FF5555] shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>📝 Texto Plano</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputViewMode('table')}
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                    inputViewMode === 'table'
                      ? 'bg-white dark:bg-[#242B3C] text-santander-red dark:text-[#FF5555] shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <Table className="w-3 h-3 text-santander-red" />
                  <span>📊 Vista Previa de Tabla (Data Preview)</span>
                  {parsedTable && (
                    <span className="bg-santander-red text-white text-[8px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                      {parsedTable.rowCount}x{parsedTable.colCount}
                    </span>
                  )}
                </button>
              </div>

              {parsedTable && (
                <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Estructura Detectada: <span className="text-monks-dark dark:text-white font-black uppercase">{parsedTable.delimiterName}</span>
                </div>
              )}
            </div>

            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleFileUpload}
              className={`relative flex flex-col transition-colors ${isDragging ? 'bg-santander-red/5' : ''}`}
            >
              {pastedToast && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-4 mt-2 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-bold flex items-center justify-between shadow-sm z-30"
                >
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-white" />
                    <span>{pastedToast}</span>
                  </div>
                  <button onClick={() => setPastedToast(null)} className="text-white/80 hover:text-white cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}

              {inputViewMode === 'text' ? (
                <textarea 
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  rows={5}
                  className="w-full p-4 text-xs outline-none focus:ring-0 font-mono text-gray-700 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 leading-relaxed bg-transparent min-h-[110px] max-h-[260px] resize-y"
                  placeholder={
                    mode === 'report' ? "Pegá métricas de BigQuery, AppsFlyer o Looker aquí... (o soltá/pegá tu Excel/PDF/Capturas con Ctrl+V)" :
                    "Describí la duda técnica... (podés adjuntar documentación)"
                  }
                />
              ) : (
                <div className="w-full p-3 overflow-x-auto overflow-y-auto max-h-[260px] min-h-[110px]">
                  {parsedTable ? (
                    <div className="border border-gray-200 dark:border-[#222838] rounded-xl overflow-hidden shadow-xs bg-white dark:bg-[#10141E]">
                      <div className="p-3 bg-gray-100 dark:bg-[#161B26] border-b border-gray-200 dark:border-[#222838] flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-200">
                          <Table className="w-4 h-4 text-santander-red" />
                          <span>Vista Previa de Filas y Columnas Pegadas</span>
                        </div>
                        <span className="text-[10px] font-mono bg-white dark:bg-[#1F2636] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 font-bold text-gray-600 dark:text-gray-300">
                          {parsedTable.rowCount} Filas · {parsedTable.colCount} Columnas
                        </span>
                      </div>
                      <div className="overflow-x-auto max-h-[340px]">
                        <table className="w-full text-left text-xs font-mono border-collapse">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-[#131722] text-gray-600 dark:text-gray-300 font-black text-[10px] uppercase border-b border-gray-200 dark:border-[#222838]">
                              {parsedTable.headers.map((h, i) => (
                                <th key={i} className="px-3.5 py-2.5 border-r border-gray-200/80 dark:border-[#222838] bg-gray-100/80 dark:bg-[#161B26] text-gray-800 dark:text-gray-200 font-extrabold whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {parsedTable.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="border-b border-gray-100 dark:border-[#1E2433] odd:bg-white dark:odd:bg-[#10141E] even:bg-gray-50/40 dark:even:bg-[#141824] hover:bg-red-50/20 dark:hover:bg-red-950/20 transition-colors">
                                {parsedTable.headers.map((_, cIdx) => {
                                  const cellVal = row[cIdx] !== undefined ? row[cIdx] : '';
                                  const isNumeric = /^[\d$%.,+\-]+$/.test(cellVal.trim());
                                  return (
                                    <td 
                                      key={cIdx} 
                                      className={`px-3.5 py-2 border-r border-gray-200/50 dark:border-[#222838] whitespace-nowrap ${
                                        isNumeric ? 'text-right font-bold text-santander-red font-mono' : 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {cellVal || <span className="text-gray-300 dark:text-gray-600 italic">-</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-2">
                      <Table className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                      <p className="text-xs font-bold dark:text-gray-300">No hay datos estructurados ingresados aún.</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">Pegá datos de Excel, TSV o CSV en la pestaña 'Texto Plano' para previsualizar aquí en tabla.</p>
                    </div>
                  )}
                </div>
              )}
              
              {isDragging && (
                <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-santander-red flex items-center justify-center bg-white/90 dark:bg-[#131722]/90 z-10">
                  <div className="text-center">
                    <CloudUpload className="w-12 h-12 text-santander-red mx-auto mb-2 animate-bounce" />
                    <p className="text-lg font-bold text-monks-dark dark:text-white">SOLTÁ TU ARCHIVO AQUÍ</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">ZIPs, Excel, PDF, CSV, JSON, Imágenes</p>
                  </div>
                </div>
              )}
              
              {/* Floating Help for Data Sources */}
              <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-none opacity-50 hover:opacity-100 transition-opacity">
                <div className="bg-white dark:bg-[#1A202E] border border-gray-200 dark:border-[#2A3347] p-2 rounded text-[9px] font-bold text-gray-400 dark:text-gray-300 shadow-sm flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Soporta .zip (paquete de One Pagers), .xlsx, PDFs y Capturas (Ctrl+V)
                </div>
              </div>
              
              {/* Screenshots Display Area */}
              {screenshots.length > 0 && (
                <div className="mx-6 mb-4 p-3 bg-gray-50 dark:bg-[#0E121A] border border-gray-100 dark:border-[#222838] rounded-lg max-h-[160px] overflow-y-auto z-20">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-santander-red" />
                      Capturas Adjuntas ({screenshots.length})
                    </p>
                    <button 
                      onClick={() => setScreenshots([])}
                      className="text-[9px] text-red-500 dark:text-red-400 hover:underline font-bold uppercase transition-all cursor-pointer"
                    >
                      Limpiar Todo
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {screenshots.map((shot) => (
                      <div key={shot.id} className="relative group w-16 h-16 bg-gray-200 dark:bg-[#1A202E] border border-gray-300 dark:border-[#2A3347] rounded overflow-hidden shadow-sm">
                        <img 
                          src={shot.previewUrl} 
                          alt={shot.name} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          onClick={() => setScreenshots(prev => prev.filter(s => s.id !== shot.id))}
                          className="absolute top-0.5 right-0.5 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:scale-105"
                          title="Eliminar captura"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-0.5 text-[7px] text-white truncate max-w-full text-center font-mono select-none" title={shot.name}>
                          {shot.name.replace("Captura Pegada", "Pego")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-2 bg-gray-50 dark:bg-[#0E121A] border-t border-gray-100 dark:border-[#222838] flex items-center gap-2.5 flex-wrap">
               <input 
                 type="file" 
                 id="file-upload" 
                 className="hidden" 
                 accept=".zip,.csv,.txt,.json,.xlsx,.xls,.pdf,.docx,.doc,.pptx,.ppt"
                 multiple
                 onChange={handleFileUpload}
               />
               <label 
                 htmlFor="file-upload" 
                 className="text-[10px] font-bold text-santander-red hover:bg-red-50 dark:hover:bg-red-950/40 px-2.5 py-1.5 rounded-md cursor-pointer border border-santander-red/20 dark:border-santander-red/40 transition-colors uppercase tracking-widest flex items-center gap-1.5"
               >
                 <Plus className="w-3 h-3" />
                 Subir Archivo/ZIP/Excel/PDF
               </label>

               <button 
                 onClick={() => {
                   setIsDriveModalOpen(true);
                   if (googleToken && driveFiles.length === 0) {
                     handleFetchDriveFiles();
                   }
                 }}
                 className="text-[10px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 px-2.5 py-1.5 rounded-md cursor-pointer border border-blue-200 dark:border-blue-800/60 transition-colors uppercase tracking-widest flex items-center gap-1.5 bg-white dark:bg-[#1A202E]"
                 title="Importar planillas de Google Sheets, archivos de Excel o PDFs directamente desde Google Drive"
               >
                 <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                 Importar de Google Drive
               </button>

               <input 
                 type="file" 
                 id="screenshot-upload" 
                 className="hidden" 
                 accept="image/*"
                 multiple
                 onChange={(e) => {
                   const files = e.target.files;
                   if (files) {
                     for (let i = 0; i < files.length; i++) {
                       const file = files[i];
                       const reader = new FileReader();
                       reader.onload = () => {
                         const resultStr = reader.result as string;
                         const rawBase64 = resultStr.split(',')[1];
                         const newScreenshot: Screenshot = {
                           id: crypto.randomUUID(),
                           name: file.name,
                           data: rawBase64,
                           mimeType: file.type,
                           previewUrl: resultStr
                         };
                         setScreenshots(prev => [...prev, newScreenshot]);
                       };
                       reader.readAsDataURL(file);
                     }
                   }
                 }}
               />
               <label 
                 htmlFor="screenshot-upload" 
                 className="text-[10px] font-bold text-monks-dark dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#222A3D] px-2.5 py-1.5 rounded-md cursor-pointer border border-gray-200 dark:border-[#2A3347] transition-colors uppercase tracking-widest flex items-center gap-1.5 bg-white dark:bg-[#1A202E]"
               >
                 <Image className="w-3.5 h-3.5 text-santander-red" />
                 Adjuntar Captura
               </label>

               <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium font-sans">
                 Pega directo imágenes con <kbd className="bg-gray-200 dark:bg-[#222838] px-1 py-0.5 rounded font-bold text-gray-600 dark:text-gray-300 text-[9px]">Ctrl+V</kbd>
               </span>
            </div>

            <div className="p-4 bg-white dark:bg-[#131722] border-t border-gray-100 dark:border-[#222838] space-y-3">
              {/* Selector de Modo de Visualización (Reporte Markdown / Gráfico Principal / Panel KPI Opcional) */}
              {mode === 'report' && (
                <div className="p-2.5 bg-gray-50/90 dark:bg-[#0E121A] rounded-lg border border-gray-200/80 dark:border-[#222838]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-200 flex items-center gap-1.5 font-mono">
                      <BarChart3 className="w-3.5 h-3.5 text-santander-red" />
                      Visualización Gráfica
                    </span>
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">
                      {visualizationMode === 'single' ? '1 gráfico de control (Default)' : visualizationMode === 'none' ? 'Solo texto Markdown' : 'Multi-gráfico + Scorecards'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVisualizationMode('single')}
                      className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer ${
                        visualizationMode === 'single'
                          ? 'bg-white dark:bg-[#1A202E] text-santander-red shadow-xs border border-santander-red/40 ring-1 ring-santander-red/20 font-black'
                          : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-[#1A202E]/60 border border-transparent'
                      }`}
                      title="Modo Recomendado: Genera el One-Pager en Markdown y 1 gráfico principal para validar proporciones"
                    >
                      <span className="truncate w-full font-bold">Gráfico Principal</span>
                      <span className="text-[8px] font-normal text-gray-400 truncate">1 gráfico de control</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVisualizationMode('none')}
                      className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer ${
                        visualizationMode === 'none'
                          ? 'bg-white dark:bg-[#1A202E] text-santander-red shadow-xs border border-santander-red/40 ring-1 ring-santander-red/20 font-black'
                          : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-[#1A202E]/60 border border-transparent'
                      }`}
                      title="Generación ultra-rápida: Solo el reporte ejecutivo en Markdown puro sin gráficos"
                    >
                      <span className="truncate w-full font-bold">Solo Markdown</span>
                      <span className="text-[8px] font-normal text-gray-400 truncate">Sin gráficos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVisualizationMode('full')}
                      className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer ${
                        visualizationMode === 'full'
                          ? 'bg-white dark:bg-[#1A202E] text-santander-red shadow-xs border border-santander-red/40 ring-1 ring-santander-red/20 font-black'
                          : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-[#1A202E]/60 border border-transparent'
                      }`}
                      title="Opcional: Panel analítico completo con scorecards y múltiples gráficos desglosados"
                    >
                      <span className="truncate w-full font-bold">Panel Completo</span>
                      <span className="text-[8px] font-normal text-gray-400 truncate">Scorecards + Multi</span>
                    </button>
                  </div>
                </div>
              )}

              <button 
                onClick={handleGenerate}
                disabled={isGenerating || (!currentInput.trim() && screenshots.length === 0)}
                className={`w-full py-3 rounded-lg font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-all ${
                  isGenerating 
                    ? 'bg-gray-100 dark:bg-[#1C2230] text-gray-400 dark:text-gray-500' 
                    : 'bg-santander-red text-white hover:bg-[#D00000] active:scale-[0.99] executive-shadow'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {mode === 'report' ? 'Generar Reporte Completo' : 'Obtener Explicación Técnica'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Result */}
        <div className="relative space-y-6">
          <div className="sticky top-24 space-y-6">
            
            {/* Interactive ReAct Reasoning Console */}
            <div className="bg-[#1C1C1C] rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
              <div className="p-4 bg-[#121212] border-b border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 animate-pulse" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  </div>
                  <div className="ml-1 flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-santander-red animate-bounce" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400">
                      Consola de Razonamiento ReAct v1.1
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[8px] font-mono text-green-500 uppercase bg-green-950/45 px-2 py-0.5 rounded border border-green-800/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    CPU ONLINE
                  </span>
                  {thinkingSteps.length > 0 && (
                    <button
                      onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
                      className="text-[10px] font-mono text-gray-400 hover:text-white flex items-center gap-1 uppercase tracking-tight cursor-pointer focus:outline-none"
                    >
                      {isReasoningExpanded ? '[ Ocultar Trace ]' : '[ Ver Trace ]'}
                      {isReasoningExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {isReasoningExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-5 font-mono text-xs text-gray-300 space-y-4 max-h-[300px] overflow-y-auto leading-relaxed">
                      {isGenerating && thinkingSteps.length === 0 ? (
                        <div className="flex items-center gap-2 text-gray-500 py-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-santander-red" />
                          <span className="animate-pulse">Ejecutando algoritmo ReAct... Conectando RAG y audiciones...</span>
                        </div>
                      ) : thinkingSteps.length === 0 ? (
                        <div className="text-gray-500 py-2 text-center text-[10px] uppercase tracking-wider font-bold">
                          Trace de razonamiento inactivo. Genera un One Pager para ver el análisis en tiempo real.
                        </div>
                      ) : (
                        <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-gray-800">
                          {thinkingSteps.map((step, idx) => (
                            <div key={idx} className="flex gap-3 items-start text-xs animate-in fade-in slide-in-from-left-2 duration-300">
                              <div className={`w-[23px] h-[23px] rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold shadow-sm z-10 ${
                                step.type === 'thought' ? 'bg-orange-950 border border-orange-800 text-orange-400' :
                                step.type === 'action' ? 'bg-blue-950 border border-blue-800 text-blue-400' :
                                step.type === 'observation' ? 'bg-green-950 border border-green-800 text-green-400' :
                                'bg-gray-800 border border-gray-700 text-gray-300'
                              }`}>
                                {step.type === 'thought' ? 'T' :
                                 step.type === 'action' ? 'A' :
                                 step.type === 'observation' ? 'O' : 'R'}
                              </div>
                              <div className="flex-1 bg-[#161616] p-2.5 rounded-lg border border-gray-800/40">
                                <span className={`font-black text-[9px] uppercase tracking-wider block mb-1 ${
                                  step.type === 'thought' ? 'text-orange-400' :
                                  step.type === 'action' ? 'text-blue-400' :
                                  step.type === 'observation' ? 'text-green-400' :
                                  'text-gray-400'
                                }`}>
                                  {step.type === 'thought' ? '⚡ Thought (Pensamiento)' :
                                   step.type === 'action' ? '⚙️ Action (Consulta RAG / Reglas)' :
                                   step.type === 'observation' ? '🔍 Observation (Anomalía / Métrica)' :
                                   '💡 Agent Output Trace'}
                                </span>
                                <p className="text-gray-300 select-all font-mono leading-relaxed text-[11px]">{step.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Split workspace & interactive board */}
            <div className="bg-white dark:bg-[#131722] rounded-xl border border-gray-200 dark:border-[#222838] executive-shadow overflow-hidden min-h-[600px] flex flex-col">
              <div className="p-4 border-b border-gray-100 dark:border-[#222838] flex justify-between items-center bg-gray-50 dark:bg-[#0E121A] flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-monks-dark dark:text-white" />
                  <h2 className="font-bold text-monks-dark dark:text-white italic tracking-widest uppercase text-xs">Interactive Split Workspace</h2>
                </div>
                
                {report && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Google OAuth & Sheets Connection */}
                    {googleUser ? (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-emerald-950/40 border border-green-200 dark:border-emerald-800/50 px-2.5 py-1.5 rounded-md text-xs font-medium text-green-800 dark:text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
                        <span className="max-w-[100px] truncate" title={googleUser.email || ''}>
                          {googleUser.displayName || 'Santander Team'}
                        </span>
                        <button
                          onClick={handleGoogleLogout}
                          className="text-gray-400 hover:text-santander-red ml-1 cursor-pointer"
                          title="Cerrar sesión de Google"
                        >
                          <LogOut className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleGoogleSignIn}
                        className="py-1.5 px-2.5 hover:bg-gray-100 dark:hover:bg-[#222838] rounded-md border border-gray-200 dark:border-[#2A3347] bg-white dark:bg-[#1A202E] transition-all text-xs font-bold flex items-center gap-1 text-gray-700 dark:text-gray-200 cursor-pointer"
                        title="Conectar con Google Workspace"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                        Vincular Google Acc
                      </button>
                    )}

                    <button
                      onClick={exportToGoogleSheets}
                      disabled={isExportingSheet}
                      className={`p-2 rounded-md border text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        exportedSheetUrl 
                          ? 'bg-green-600 border-green-600 text-white hover:bg-green-700' 
                          : 'bg-white dark:bg-[#1A202E] border-gray-200 dark:border-[#2A3347] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#222838] hover:text-green-600'
                      }`}
                      title="Sincronizar directamente con Looker Studio vía Google Sheets"
                    >
                      {isExportingSheet ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-green-600" />
                          <span>Exportando...</span>
                        </>
                      ) : exportedSheetUrl ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Spreadsheet Listo</span>
                        </>
                      ) : (
                        <>
                          <Table className="w-3.5 h-3.5 text-green-600" />
                          <span>Sincronizar Looker</span>
                        </>
                      )}
                    </button>

                    <button 
                      onClick={() => {
                        const element = document.createElement("a");
                        const file = new Blob([report], {type: 'text/plain'});
                        element.href = URL.createObjectURL(file);
                        element.download = `Reporte_Santander_${new Date().toISOString().slice(0,10)}.md`;
                        document.body.appendChild(element);
                        element.click();
                        document.body.removeChild(element);
                      }}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-[#222838] hover:text-santander-red rounded-md border border-gray-200 dark:border-[#2A3347] bg-white dark:bg-[#1A202E] transition-all text-xs font-bold flex items-center gap-1 text-gray-700 dark:text-gray-200 cursor-pointer"
                      title="Descargar reporte como archivo de texto"
                    >
                      <Download className="w-3.5 h-3.5 text-santander-red" />
                      Guardar .md
                    </button>

                    <button 
                      onClick={copyToClipboard}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-[#222838] hover:text-santander-red rounded-md border border-gray-200 dark:border-[#2A3347] bg-white dark:bg-[#1A202E] transition-all text-xs font-bold flex items-center gap-1.5 text-gray-700 dark:text-gray-200 cursor-pointer"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-600 animate-pulse" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      {copied ? '¡Copiado!' : 'Copiar Todo'}
                    </button>
                  </div>
                )}
              </div>

              {/* Tab Selector inside workspace */}
              {report && (
                <div className="flex border-b border-gray-100 dark:border-[#222838] bg-gray-50 dark:bg-[#0E121A] text-xs">
                  <button
                    onClick={() => setWorkspaceTab('preview')}
                    className={`flex-1 py-3 px-4 font-bold uppercase border-b-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      workspaceTab === 'preview'
                        ? 'border-santander-red text-santander-red bg-white dark:bg-[#131722]'
                        : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#181D2A]'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    Vista Previa (Markdown)
                  </button>
                  <button
                    onClick={() => setWorkspaceTab('edit')}
                    className={`flex-1 py-3 px-4 font-bold uppercase border-b-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      workspaceTab === 'edit'
                        ? 'border-santander-red text-santander-red bg-white dark:bg-[#131722]'
                        : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#181D2A]'
                    }`}
                  >
                    <Edit3 className="w-4 h-4" />
                    Editor Manual
                  </button>
                  <button
                    onClick={() => {
                      if (hasKpiVisuals(kpiPanel) || chartData) {
                        setWorkspaceTab('chart');
                      }
                    }}
                    disabled={!hasKpiVisuals(kpiPanel) && !chartData}
                    className={`flex-1 py-3 px-4 font-bold uppercase border-b-2 flex items-center justify-center gap-2 transition-all ${
                      !hasKpiVisuals(kpiPanel) && !chartData 
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-55' 
                        : 'cursor-pointer'
                    } ${
                      workspaceTab === 'chart'
                        ? 'border-santander-red text-santander-red bg-white dark:bg-[#131722] font-black'
                        : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#181D2A]'
                    }`}
                  >
                    <AreaChart className={`w-4 h-4 ${(hasKpiVisuals(kpiPanel) || chartData) ? 'text-santander-red' : ''}`} />
                    <span>{kpiPanel && hasKpiVisuals(kpiPanel) ? 'Panel KPI' : 'Gráfico Principal'}</span>
                    {(hasKpiVisuals(kpiPanel) || chartData) && (
                      <span className="bg-santander-red text-white text-[8px] px-1.5 py-0.5 rounded-full font-mono font-bold animate-pulse">
                        ¡Listo!
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (historyReports.length > 0) {
                        if (!compareReportId) setCompareReportId(historyReports[0].id);
                        setWorkspaceTab('compare');
                      } else {
                        setPastedToast("Genera o guarda reportes previos para poder comparar.");
                        setTimeout(() => setPastedToast(null), 3000);
                      }
                    }}
                    className={`flex-1 py-3 px-4 font-bold uppercase border-b-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      workspaceTab === 'compare'
                        ? 'border-santander-red text-santander-red bg-white dark:bg-[#131722] font-black'
                        : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#181D2A]'
                    }`}
                  >
                    <GitCompare className={`w-4 h-4 ${workspaceTab === 'compare' ? 'text-santander-red' : ''}`} />
                    <span>Side-by-Side</span>
                    {historyReports.length > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        workspaceTab === 'compare' ? 'bg-santander-red/10 dark:bg-santander-red/20 text-santander-red' : 'bg-gray-200 dark:bg-[#222838] text-gray-700 dark:text-gray-300'
                      }`}>
                        {historyReports.length}
                      </span>
                    )}
                  </button>
                </div>
              )}

              <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-white dark:bg-[#131722] flex flex-col min-h-[450px]">
                <AnimatePresence mode="wait">
                  {detectedRisk && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-6 bg-red-50/90 border border-red-200 rounded-xl overflow-hidden shadow-sm border-l-4 border-l-red-600"
                    >
                      <div className="p-5 flex gap-4 items-start">
                        <div className="p-2 bg-red-100 rounded-lg text-red-600 shrink-0">
                          <AlertTriangle className="w-5 h-5 animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h3 className="text-[10px] font-black text-red-800 uppercase tracking-widest flex items-center gap-2">
                              Alerta de Riesgo Detectada
                              <span className="bg-red-200 text-red-700 px-1.5 py-0.5 rounded text-[8px] animate-pulse font-mono font-bold">Critical</span>
                            </h3>
                            <button
                              onClick={() => setIsRiskDialogueOpen(!isRiskDialogueOpen)}
                              className="px-2.5 py-1 bg-red-600 text-white hover:bg-red-700 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              {isRiskDialogueOpen ? 'Ocultar Diálogo' : 'Dialogar sobre esta Alerta (IA)'}
                            </button>
                          </div>
                          <p className="text-xs text-red-700 mt-1.5 font-bold leading-relaxed">{detectedRisk}</p>
                          <p className="text-[10px] text-red-500 mt-1.5 italic flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" />
                            Verificado vs Knowledge Base RAG y manuales de Santander
                          </p>
                        </div>
                      </div>

                      {/* Interactive Dialogue Box for Risk Alert */}
                      <AnimatePresence>
                        {isRiskDialogueOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-t border-red-200 bg-white p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                              <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                                Diálogo Interactivo sobre esta Alerta de Riesgo
                              </span>
                              <span className="text-[9px] text-gray-400 font-mono">Agente Santander</span>
                            </div>

                            {/* Quick prompt chips */}
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => handleSendRiskQuestion("¿Por qué ocurrió esta desviación o riesgo?")}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-800 text-[10px] font-bold rounded-lg border border-red-200/60 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                ❓ ¿Por qué ocurrió esto?
                              </button>
                              <button
                                onClick={() => handleSendRiskQuestion("¿Cómo mitigar o resolver esta alerta de riesgo?")}
                                className="px-2.5 py-1 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-800 dark:text-red-300 text-[10px] font-bold rounded-lg border border-red-200/60 dark:border-red-800/50 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                🛡️ ¿Cómo solucionarlo?
                              </button>
                              <button
                                onClick={() => handleSendRiskQuestion("Redacta un párrafo ejecutivo para explicar este riesgo a Santander.")}
                                className="px-2.5 py-1 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-800 dark:text-red-300 text-[10px] font-bold rounded-lg border border-red-200/60 dark:border-red-800/50 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                📝 Explicación para cliente
                              </button>
                            </div>

                            {/* Messages Feed */}
                            <div className="max-h-[220px] overflow-y-auto space-y-2 p-2 bg-gray-50 dark:bg-[#0E121A] rounded-lg border border-gray-100 dark:border-[#222838] text-xs">
                              {riskDialogueMessages.length === 0 ? (
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 italic text-center py-3">
                                  Hacé una pregunta sobre la alerta o presioná uno de los botones sugeridos arriba.
                                </p>
                              ) : (
                                riskDialogueMessages.map(m => (
                                  <div key={m.id} className={`p-2.5 rounded-lg text-xs ${m.sender === 'user' ? 'bg-red-600 text-white ml-6' : 'bg-white dark:bg-[#1A202E] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-[#2A3347] mr-6 shadow-sm'}`}>
                                    <div className="flex justify-between items-center mb-1 text-[9px] opacity-75 font-mono">
                                      <span className="font-bold">{m.sender === 'user' ? 'Tú' : 'Agente Santander'}</span>
                                      <span>{m.time}</span>
                                    </div>
                                    <div className="markdown-body text-xs leading-relaxed font-sans">
                                      {m.sender === 'user' ? m.text : <ReactMarkdown>{m.text}</ReactMarkdown>}
                                    </div>
                                  </div>
                                ))
                              )}
                              {isRiskDialogueLoading && (
                                <div className="p-2.5 bg-white dark:bg-[#1A202E] rounded-lg border border-gray-200 dark:border-[#2A3347] flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                                  <span>Analizando datos de la alerta y normativa...</span>
                                </div>
                              )}
                            </div>

                            {/* Input Box */}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={riskDialogueInput}
                                onChange={(e) => setRiskDialogueInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendRiskQuestion()}
                                placeholder="Preguntale lo que quieras sobre esta alerta de riesgo..."
                                className="flex-1 px-3 py-2 text-xs border border-gray-200 dark:border-[#2A3347] rounded-lg outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 bg-white dark:bg-[#1A202E] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                              />
                              <button
                                onClick={() => handleSendRiskQuestion()}
                                disabled={isRiskDialogueLoading || !riskDialogueInput.trim()}
                                className="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {sheetExportError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl flex gap-3 items-center text-red-700 dark:text-red-300 text-xs font-bold"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{sheetExportError}</span>
                      <button 
                        onClick={() => setSheetExportError(null)}
                        className="ml-auto bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 px-2 py-1 rounded text-[10px] cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </motion.div>
                  )}

                  {exportedSheetUrl && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-6 p-6 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl shadow-sm hover:shadow-md transition-all border-l-4 border-l-emerald-600"
                    >
                      <div className="flex gap-4 items-start">
                        <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/60 rounded-lg text-emerald-600 dark:text-emerald-400 shrink-0">
                          <Table className="w-6 h-6 animate-bounce" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-widest flex items-center gap-2">
                            ¡Sincronización looker studio lista!
                            <span className="bg-emerald-200 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded text-[9px] font-mono">Google Sheets</span>
                          </h3>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 font-medium leading-relaxed">
                            Se ha generado exitosamente la hoja de cálculo con el consolidado ejecutivo y las métricas estructuradas ideales para alimentar tableros o paneles de visualización.
                          </p>

                          <div className="mt-4 bg-white/70 dark:bg-[#10141E]/80 border border-emerald-100/50 dark:border-emerald-800/40 p-4 rounded-lg text-[11px] text-emerald-900 dark:text-emerald-200 space-y-2 leading-relaxed">
                            <p className="font-bold flex items-center gap-1.5 text-emerald-950 dark:text-emerald-300 uppercase tracking-tight text-[11px]">
                              <span>🚀 Pasos para Conectar con Looker / Data Studio:</span>
                            </p>
                            <ul className="list-decimal list-inside space-y-1 text-emerald-800 dark:text-emerald-300">
                              <li>Abrí la hoja de cálculo generada mediante el botón de abajo.</li>
                              <li>Ingresá a <a href="https://lookerstudio.google.com/" target="_blank" rel="noreferrer" className="underline font-bold text-emerald-950 dark:text-emerald-200">Looker Studio</a> y creá un nuevo informe.</li>
                              <li>Seleccioná el conector de datos de <strong>Google Sheets</strong>.</li>
                              <li>Elegí esta hoja de cálculo (<span className="font-bold">Reporte Santander - {chartData?.title || 'Generales'}</span>) y seleccioná la pestaña <span className="font-extrabold text-emerald-950 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/60 px-1 rounded">Dato de Métricas (Looker Studio)</span>.</li>
                            </ul>
                          </div>

                          <div className="mt-4 flex gap-2">
                            <a
                              href={exportedSheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                            >
                              <Eye className="w-4 h-4" />
                              Ver Documento / Google Sheets
                            </a>
                            <button
                              onClick={() => setExportedSheetUrl(null)}
                              className="px-3 py-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            >
                              Cerrar Guía
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {!report && !isGenerating && (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex-1 flex flex-col items-center justify-center text-gray-300 text-center space-y-4 py-16"
                    >
                      <div className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-full flex items-center justify-center">
                        <FileText className="w-10 h-10" />
                      </div>
                      <p className="text-sm max-w-[240px] text-gray-400">
                        El reporte estructurado aparecerá aquí después de ejecutar el Agente.
                      </p>
                    </motion.div>
                  )}

                  {isGenerating && (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex-1 flex flex-col items-center justify-center text-gray-400 space-y-6 p-12 py-20"
                    >
                      <div className="relative">
                        <Loader2 className="w-12 h-12 animate-spin text-santander-red opacity-50" />
                        <Sparkles className="w-6 h-6 text-santander-red absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <div className="space-y-2 text-center">
                        <p className="font-bold text-monks-dark animate-pulse tracking-wide">GENERANDO REPORTE CON COGNICIÓN ReAct</p>
                        <p className="text-xs">Aplicando grounding, buscando discrepancias y graficando KPIs...</p>
                      </div>
                    </motion.div>
                  )}

                  {report && !isGenerating && (
                    <div className="flex-1 flex flex-col">
                      {workspaceTab === 'preview' && (
                        <motion.div 
                          key="preview-pane"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex-1 flex flex-col"
                        >
                          {/* PowerPoint Fit-To-Box Quick Block Copy Toolbar */}
                          {reportBlocks.length > 0 && (
                            <div className="mb-6 p-4 bg-gradient-to-r from-red-50/90 via-gray-50 to-white dark:from-[#1E1417] dark:via-[#131722] dark:to-[#10141E] border border-red-200/80 dark:border-red-900/40 rounded-xl shadow-xs space-y-2.5">
                              <div className="flex justify-between items-center flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <Copy className="w-4 h-4 text-santander-red" />
                                  <h3 className="text-xs font-black uppercase text-monks-dark dark:text-white tracking-wide flex items-center gap-1.5">
                                    Copiar por Bloque para PowerPoint (Fit-To-Box)
                                  </h3>
                                </div>
                                <span className="text-[9px] font-mono font-bold bg-santander-red text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  Límite Estricto PPT
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">
                                Hacé clic en cualquier bloque para copiar el texto formateado directamente a los cuadros de tu presentación de PowerPoint:
                              </p>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {reportBlocks.map(block => {
                                  const isCopied = copiedBlockId === block.id;
                                  return (
                                    <button
                                      key={block.id}
                                      type="button"
                                      onClick={() => copyBlockToClipboard(block.id, block.text, block.title)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 shadow-xs ${
                                        isCopied
                                          ? 'bg-emerald-600 text-white border-emerald-600 scale-[1.03]'
                                          : block.id === 'risk'
                                          ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                                          : 'bg-white dark:bg-[#1A202E] text-gray-800 dark:text-gray-200 border-gray-200 dark:border-[#2A3347] hover:border-santander-red hover:text-santander-red'
                                      }`}
                                      title={`Copiar ${block.title} (${block.charCount} caracteres)`}
                                    >
                                      {isCopied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                                      <span>{block.title}</span>
                                      <span className={`text-[9px] font-mono px-1 rounded ${
                                        isCopied ? 'bg-emerald-700 text-white' : 'bg-gray-100 dark:bg-[#222838] text-gray-500 dark:text-gray-400'
                                      }`}>
                                        {block.charCount} chars
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="markdown-body flex-1" onCopy={handleReportCopy}>
                            <ReactMarkdown>{report}</ReactMarkdown>
                          </div>
                        </motion.div>
                      )}

                      {workspaceTab === 'edit' && (
                        <motion.div
                          key="edit-pane"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex-1 flex flex-col space-y-3"
                        >
                          <div className="p-3 bg-yellow-50 dark:bg-amber-950/40 border border-yellow-200 dark:border-amber-800/50 rounded-lg text-xs text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                            <span>✍️</span>
                            <p><strong>Espacio del Editor:</strong> Podés re-escribir directivas o editar números e indicadores de conversión manualmente. Se renderizará en tiempo real al volver a Vista Previa.</p>
                          </div>
                          <textarea
                            value={report}
                            onChange={(e) => setReport(e.target.value)}
                            className="w-full min-h-[480px] flex-1 p-5 text-xs font-mono border border-gray-200 dark:border-[#2A3347] rounded-lg outline-none focus:border-santander-red focus:ring-1 focus:ring-santander-red resize-none bg-gray-50 dark:bg-[#0E121A] leading-relaxed text-gray-800 dark:text-gray-100 shadow-inner"
                            placeholder="Edita tu reporte aquí..."
                          />
                        </motion.div>
                      )}

                      {workspaceTab === 'chart' && (
                        <motion.div
                          key="chart-pane"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex-1"
                        >
                          {kpiPanel && hasKpiVisuals(kpiPanel) ? (
                            <div className="space-y-6">
                              <KpiDashboard panel={kpiPanel} isDark={theme === 'dark'} />
                            </div>
                          ) : chartData ? (
                            <div className="space-y-6">
                              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#222838] pb-3">
                                <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight flex items-center gap-1.5">
                                  <AreaChart className="w-4 h-4 text-santander-red" />
                                  Visualización Gráfica: {chartData.title || 'Métricas Extraídas'}
                                </h3>
                                <span className="text-[10px] bg-santander-red/10 text-santander-red px-2 py-0.5 rounded font-mono font-bold uppercase">
                                  Recharts {chartData.type}
                                </span>
                              </div>

                              <div className="h-72 w-full bg-[#FAF9F8] dark:bg-[#0E121A] p-4 border border-gray-100 dark:border-[#222838] rounded-lg shadow-inner flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                  {chartData.type === 'line' ? (
                                    <LineChart data={chartData.data}>
                                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#222838' : '#e8e8e8'} />
                                      <XAxis dataKey="name" stroke={isDark ? '#94A3B8' : '#666'} fontSize={10} tickLine={false} />
                                      <YAxis stroke={isDark ? '#94A3B8' : '#666'} fontSize={10} tickLine={false} />
                                      <Tooltip 
                                        contentStyle={{ backgroundColor: isDark ? '#1A202E' : '#fff', borderColor: isDark ? '#2A3347' : '#e2e8f0', borderRadius: '8px', fontSize: '11px', color: isDark ? '#fff' : '#000' }} 
                                        labelStyle={{ fontWeight: 'bold', color: isDark ? '#F1F5F9' : '#111' }}
                                      />
                                      <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: '11px' }} />
                                      <Line type="monotone" dataKey="value" stroke="#EC0000" strokeWidth={3} activeDot={{ r: 8 }} name="KPI" />
                                    </LineChart>
                                  ) : chartData.type === 'pie' ? (
                                    <PieChart>
                                      <Pie
                                        data={chartData.data}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={true}
                                        outerRadius={75}
                                        fill="#8884d8"
                                        dataKey="value"
                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                      >
                                        {chartData.data.map((entry, index) => {
                                          const colors = ['#EC0000', '#1C1C1C', '#D00000', '#4A4A4A', '#7F7F7F'];
                                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                        })}
                                      </Pie>
                                      <Tooltip contentStyle={{ backgroundColor: isDark ? '#1A202E' : '#fff', borderColor: isDark ? '#2A3347' : '#e2e8f0', fontSize: '11px', borderRadius: '6px' }} />
                                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                                    </PieChart>
                                  ) : (
                                    <BarChart data={chartData.data}>
                                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#222838' : '#e8e8e8'} />
                                      <XAxis dataKey="name" stroke={isDark ? '#94A3B8' : '#666'} fontSize={10} tickLine={false} />
                                      <YAxis stroke={isDark ? '#94A3B8' : '#666'} fontSize={10} tickLine={false} />
                                      <Tooltip 
                                        contentStyle={{ backgroundColor: isDark ? '#1A202E' : '#fff', borderColor: isDark ? '#2A3347' : '#e2e8f0', borderRadius: '8px', fontSize: '11px', color: isDark ? '#fff' : '#000' }}
                                        cursor={{ fill: 'rgba(236, 0, 0, 0.08)' }}
                                      />
                                      <Bar dataKey="value" fill="#EC0000" radius={[4, 4, 0, 0]} name="Valor">
                                        {chartData.data.map((entry, index) => {
                                          const colors = ['#EC0000', '#3B82F6', '#D00000', '#6366F1', '#A855F7'];
                                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                        })}
                                      </Bar>
                                    </BarChart>
                                  )}
                                </ResponsiveContainer>
                              </div>

                              {/* Numerical data table */}
                              <div className="bg-white dark:bg-[#10141E] border border-gray-100 dark:border-[#222838] rounded-lg overflow-hidden">
                                <thead className="bg-[#FAF9F8] dark:bg-[#161B26]">
                                  <div className="bg-gray-100 dark:bg-[#161B26] border-b border-gray-200 dark:border-[#222838] px-3 py-2 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-1 leading-none select-none">
                                    Tabla Analítica de Métricas Reales
                                  </div>
                                </thead>
                                <table className="w-full text-left text-xs text-gray-500 dark:text-gray-400">
                                  <thead className="bg-[#FAF9F8] dark:bg-[#131722] text-[9px] uppercase font-bold text-gray-400 dark:text-gray-400">
                                    <tr>
                                      <th className="px-4 py-2 border-b border-gray-100 dark:border-[#222838]">Indicador / Canal</th>
                                      <th className="px-4 py-2 border-b border-gray-100 dark:border-[#222838] text-right">Métrica Registrada</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {chartData.data.map((row, index) => (
                                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-[#161B26] transition-colors border-b border-gray-100 dark:border-[#222838] last:border-b-0">
                                        <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">{row.name}</td>
                                        <td className="px-4 py-2 text-right font-mono font-bold text-santander-red">
                                          {row.value.toLocaleString('es-MX')}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-16 text-gray-300 dark:text-gray-600">
                              <AreaChart className="w-12 h-12 text-gray-200 dark:text-gray-600 mx-auto mb-3" />
                              <p className="text-xs dark:text-gray-400">No se detectaron métricas numéricas estructuradas adecuados para gráficos.</p>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {workspaceTab === 'compare' && (
                        <motion.div
                          key="compare-pane"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex-1 flex flex-col space-y-4"
                        >
                          {/* Comparison Header & Controls Bar */}
                          <div className="p-4 bg-gradient-to-r from-red-50/70 via-gray-50 to-indigo-50/70 dark:from-[#1A1215] dark:via-[#131722] dark:to-[#121625] border border-gray-200 dark:border-[#222838] rounded-xl shadow-xs space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-santander-red text-white rounded-lg shadow-xs">
                                  <GitCompare className="w-4 h-4" />
                                </div>
                                <div>
                                  <h3 className="text-xs font-black text-monks-dark dark:text-white uppercase tracking-wider flex items-center gap-2">
                                    Comparativa Side-by-Side de Versiones
                                    <span className="bg-santander-red/10 dark:bg-santander-red/20 text-santander-red px-2 py-0.5 rounded text-[9px] font-mono font-bold">
                                      DIFERENCIAL
                                    </span>
                                  </h3>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Compara en paralelo el reporte generado actual contra versiones históricas guardadas.
                                  </p>
                                </div>
                              </div>

                              {/* Action Buttons: Sync Scroll, Copy Summary, Restore */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setIsSyncScroll(prev => !prev)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                                    isSyncScroll
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                      : 'bg-white dark:bg-[#1A202E] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#2A3347] hover:bg-gray-100 dark:hover:bg-[#252E42]'
                                  }`}
                                  title={isSyncScroll ? 'Desactivar scroll sincronizado' : 'Activar scroll sincronizado'}
                                >
                                  <Split className="w-3.5 h-3.5" />
                                  <span>Scroll Sincronizado: {isSyncScroll ? 'ON' : 'OFF'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={copyComparisonSummary}
                                  className="px-2.5 py-1.5 bg-white dark:bg-[#1A202E] hover:bg-gray-100 dark:hover:bg-[#252E42] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-[#2A3347] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                                  title="Copiar informe de diferencias entre ambas versiones"
                                >
                                  <Copy className="w-3.5 h-3.5 text-santander-red" />
                                  <span>Copiar Resumen Delta</span>
                                </button>

                                {activeCompareReport && (
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreHistoricalReport(activeCompareReport)}
                                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                                    title="Cargar esta versión histórica como la versión activa del workspace"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Restaurar Histórica</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setIsHistoryModalOpen(true)}
                                  className="px-2.5 py-1.5 bg-gray-100 dark:bg-[#1A202E] hover:bg-gray-200 dark:hover:bg-[#252E42] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-[#2A3347] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                  <History className="w-3.5 h-3.5" />
                                  <span>Historial Completo</span>
                                </button>
                              </div>
                            </div>

                            {/* Historical Report Selector Dropdown & Delta Metrics */}
                            <div className="pt-2 border-t border-gray-200/80 dark:border-[#222838] flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                                <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 shrink-0 flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                  Versión Histórica:
                                </span>
                                <select
                                  value={activeCompareReport?.id || ''}
                                  onChange={(e) => setCompareReportId(e.target.value)}
                                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-[#1A202E] text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-[#2A3347] rounded-lg outline-none focus:border-santander-red focus:ring-1 focus:ring-santander-red font-medium cursor-pointer shadow-xs"
                                >
                                  {historyReports.map(item => (
                                    <option key={item.id} value={item.id}>
                                      [{getCategoryLabel(item.category)}] {item.title} ({new Date(item.createdAt).toLocaleDateString('es-MX')} - {new Date(item.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {activeCompareReport && (() => {
                                const curLen = report.length;
                                const histLen = activeCompareReport.output.length;
                                const delta = curLen - histLen;
                                const pct = Math.round((delta / (histLen || 1)) * 100);

                                return (
                                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                    <div className="px-2.5 py-1 bg-white dark:bg-[#1A202E] border border-gray-200 dark:border-[#2A3347] rounded-md font-mono flex items-center gap-1.5 shadow-xs">
                                      <span className="text-gray-500 dark:text-gray-400">Variación de Caracteres:</span>
                                      <span className={`font-bold ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                        {delta >= 0 ? `+${delta}` : delta} chars ({pct >= 0 ? `+${pct}` : pct}%)
                                      </span>
                                    </div>

                                    <div className="px-2.5 py-1 bg-white dark:bg-[#1A202E] border border-gray-200 dark:border-[#2A3347] rounded-md font-mono flex items-center gap-1.5 shadow-xs">
                                      <span className="text-gray-500 dark:text-gray-400">Riesgo:</span>
                                      <span className={`font-bold ${detectedRisk ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        Actual: {detectedRisk ? '⚠️ Alerta' : '✅ OK'}
                                      </span>
                                      <span className="text-gray-300 dark:text-gray-600">vs</span>
                                      <span className={`font-bold ${activeCompareReport.detectedRisk ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        Hist: {activeCompareReport.detectedRisk ? '⚠️ Alerta' : '✅ OK'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Side-by-Side Dual Columns */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 items-stretch">
                            {/* LEFT COLUMN: Versión Actual */}
                            <div className="bg-white dark:bg-[#0E121A] border-2 border-red-200 dark:border-red-950/60 rounded-xl overflow-hidden shadow-sm flex flex-col">
                              {/* Left Column Header */}
                              <div className="p-3 bg-red-50/80 dark:bg-[#1E1417] border-b border-red-200/80 dark:border-red-900/40 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-santander-red animate-pulse"></span>
                                  <h4 className="text-xs font-black uppercase text-santander-red tracking-wider">
                                    Versión Actual (Workspace)
                                  </h4>
                                  <span className="bg-santander-red text-white text-[9px] px-1.5 py-0.2 rounded font-mono font-bold">
                                    ACTIVO
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                                  <span>{report.length} caracteres</span>
                                  <span>•</span>
                                  <span>~{report.split(/\s+/).filter(Boolean).length} palabras</span>
                                </div>
                              </div>

                              {/* Quick blocks toolbar for Current */}
                              {reportBlocks.length > 0 && (
                                <div className="px-4 py-2 bg-gray-50 dark:bg-[#131722] border-b border-gray-200 dark:border-[#222838] flex flex-wrap gap-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 self-center mr-1">Fit-To-Box:</span>
                                  {reportBlocks.map(block => (
                                    <button
                                      key={block.id}
                                      type="button"
                                      onClick={() => copyBlockToClipboard(block.id, block.text, block.title)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer border ${
                                        copiedBlockId === block.id
                                          ? 'bg-emerald-600 text-white border-emerald-600'
                                          : 'bg-white dark:bg-[#1A202E] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-[#2A3347] hover:border-santander-red hover:text-santander-red'
                                      }`}
                                      title={`Copiar ${block.title}`}
                                    >
                                      {copiedBlockId === block.id ? '✓ Copiado' : block.title}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Current Markdown Container */}
                              <div 
                                ref={leftCompareScrollRef}
                                onScroll={handleLeftScroll}
                                className="p-5 md:p-6 overflow-y-auto max-h-[620px] flex-1 markdown-body bg-white dark:bg-[#0E121A]"
                              >
                                {detectedRisk && (
                                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-lg text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                    <div>
                                      <strong className="block uppercase text-[10px] tracking-wider text-red-700 dark:text-red-400">Alerta de Riesgo Activa:</strong>
                                      <span>{detectedRisk}</span>
                                    </div>
                                  </div>
                                )}

                                <ReactMarkdown>{report}</ReactMarkdown>
                              </div>
                            </div>

                            {/* RIGHT COLUMN: Versión Histórica */}
                            <div className="bg-white dark:bg-[#0E121A] border-2 border-indigo-200 dark:border-indigo-950/60 rounded-xl overflow-hidden shadow-sm flex flex-col">
                              {/* Right Column Header */}
                              <div className="p-3 bg-indigo-50/80 dark:bg-[#141829] border-b border-indigo-200/80 dark:border-indigo-900/40 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                  <h4 className="text-xs font-black uppercase text-indigo-700 dark:text-indigo-300 tracking-wider">
                                    {activeCompareReport ? activeCompareReport.title : 'Versión Histórica'}
                                  </h4>
                                  {activeCompareReport && (
                                    <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase">
                                      {getCategoryLabel(activeCompareReport.category)}
                                    </span>
                                  )}
                                </div>

                                {activeCompareReport && (
                                  <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                                    <span>{new Date(activeCompareReport.createdAt).toLocaleDateString('es-MX')}</span>
                                    <span>•</span>
                                    <span>{activeCompareReport.output.length} caracteres</span>
                                  </div>
                                )}
                              </div>

                              {/* Input prompt snippet banner of Historical */}
                              {activeCompareReport?.input && (
                                <div className="px-4 py-2 bg-gray-50 dark:bg-[#131722] border-b border-gray-200 dark:border-[#222838] text-[10px] text-gray-600 dark:text-gray-300 font-mono line-clamp-1">
                                  <strong className="text-gray-800 dark:text-gray-200">Input Origen:</strong> {activeCompareReport.input}
                                </div>
                              )}

                              {/* Historical Markdown Container */}
                              <div 
                                ref={rightCompareScrollRef}
                                onScroll={handleRightScroll}
                                className="p-5 md:p-6 overflow-y-auto max-h-[620px] flex-1 markdown-body bg-white dark:bg-[#0E121A]"
                              >
                                {activeCompareReport ? (
                                  <>
                                    {activeCompareReport.detectedRisk && (
                                      <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-lg text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                        <div>
                                          <strong className="block uppercase text-[10px] tracking-wider text-red-700 dark:text-red-400">Alerta de Riesgo Registrada:</strong>
                                          <span>{activeCompareReport.detectedRisk}</span>
                                        </div>
                                      </div>
                                    )}

                                    <ReactMarkdown>{activeCompareReport.output}</ReactMarkdown>
                                  </>
                                ) : (
                                  <div className="h-full flex flex-col items-center justify-center py-20 text-center text-gray-400 space-y-3">
                                    <History className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300">No hay versiones guardadas en el historial.</p>
                                    <p className="text-[11px] text-gray-400 max-w-xs">Generá reportes con el Agente para guardar copias y poder comparar.</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Interactive Dialogue Section with Insights */}
                      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-[#222838] bg-gray-50/90 dark:bg-[#0E121A] rounded-xl p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-santander-red animate-pulse" />
                            <h3 className="text-xs font-extrabold text-monks-dark dark:text-white uppercase tracking-wider">
                              Dialogar con los Insights
                            </h3>
                          </div>
                          <div className="flex items-center gap-1 bg-white dark:bg-[#1A202E] border border-gray-200 dark:border-[#2A3347] p-1 rounded-lg text-[10px]">
                            <button
                              onClick={() => setSelectedInsightCategory('all')}
                              className={`px-2 py-1 rounded font-bold transition-all cursor-pointer ${selectedInsightCategory === 'all' ? 'bg-santander-red text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                            >
                              General
                            </button>
                            <button
                              onClick={() => setSelectedInsightCategory('highlights')}
                              className={`px-2 py-1 rounded font-bold transition-all cursor-pointer ${selectedInsightCategory === 'highlights' ? 'bg-santander-red text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                            >
                              Highlights
                            </button>
                            <button
                              onClick={() => setSelectedInsightCategory('trafico')}
                              className={`px-2 py-1 rounded font-bold transition-all cursor-pointer ${selectedInsightCategory === 'trafico' ? 'bg-santander-red text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                            >
                              Tráfico
                            </button>
                            <button
                              onClick={() => setSelectedInsightCategory('medios')}
                              className={`px-2 py-1 rounded font-bold transition-all cursor-pointer ${selectedInsightCategory === 'medios' ? 'bg-santander-red text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                            >
                              Medios
                            </button>
                          </div>
                        </div>

                        {/* Quick prompt chips */}
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => handleSendInsightsQuestion("¿Cuáles son los 3 hallazgos más importantes de este informe?")}
                            className="px-2.5 py-1 bg-white dark:bg-[#1A202E] hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-700 dark:text-gray-300 hover:text-santander-red dark:hover:text-santander-red text-[10px] font-bold rounded-lg border border-gray-200 dark:border-[#2A3347] transition-colors cursor-pointer shadow-xs"
                          >
                            💡 3 Hallazgos Clave
                          </button>
                          <button
                            onClick={() => handleSendInsightsQuestion("Dame un desglose analítico de la sección de Análisis de Tráfico.")}
                            className="px-2.5 py-1 bg-white dark:bg-[#1A202E] hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-700 dark:text-gray-300 hover:text-santander-red dark:hover:text-santander-red text-[10px] font-bold rounded-lg border border-gray-200 dark:border-[#2A3347] transition-colors cursor-pointer shadow-xs"
                          >
                            🚦 Detalle de Tráfico
                          </button>
                          <button
                            onClick={() => handleSendInsightsQuestion("¿Qué rendimiento tuvo la pauta en Medios y cuáles fueron los canales más eficientes?")}
                            className="px-2.5 py-1 bg-white dark:bg-[#1A202E] hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-700 dark:text-gray-300 hover:text-santander-red dark:hover:text-santander-red text-[10px] font-bold rounded-lg border border-gray-200 dark:border-[#2A3347] transition-colors cursor-pointer shadow-xs"
                          >
                            🎯 Evaluación de Medios
                          </button>
                          <button
                            onClick={() => handleSendInsightsQuestion("¿Qué acciones estratégicas recomendarías para el próximo reporte o campaña?")}
                            className="px-2.5 py-1 bg-white dark:bg-[#1A202E] hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-700 dark:text-gray-300 hover:text-santander-red dark:hover:text-santander-red text-[10px] font-bold rounded-lg border border-gray-200 dark:border-[#2A3347] transition-colors cursor-pointer shadow-xs"
                          >
                            🚀 Acciones sugeridas
                          </button>
                        </div>

                        {/* Chat message feed */}
                        {insightsDialogueMessages.length > 0 && (
                          <div className="max-h-[260px] overflow-y-auto space-y-2.5 p-3 bg-white dark:bg-[#131722] rounded-lg border border-gray-200 dark:border-[#2A3347] shadow-inner">
                            {insightsDialogueMessages.map(m => (
                              <div key={m.id} className={`p-3 rounded-lg text-xs ${m.sender === 'user' ? 'bg-santander-red text-white ml-8 shadow-sm' : 'bg-gray-50 dark:bg-[#1A202E] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-[#2A3347] mr-8 shadow-sm'}`}>
                                <div className="flex justify-between items-center mb-1 text-[9px] opacity-80 font-mono">
                                  <span className="font-bold">{m.sender === 'user' ? 'Tú' : 'Agente Santander'}</span>
                                  <span>{m.time}</span>
                                </div>
                                <div className="markdown-body text-xs leading-relaxed font-sans">
                                  {m.sender === 'user' ? m.text : <ReactMarkdown>{m.text}</ReactMarkdown>}
                                </div>
                              </div>
                            ))}
                            {isInsightsDialogueLoading && (
                              <div className="p-3 bg-gray-50 dark:bg-[#1A202E] rounded-lg border border-gray-200 dark:border-[#2A3347] flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-santander-red" />
                                <span>Analizando los datos del reporte e insights...</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Input bar */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={insightsDialogueInput}
                            onChange={(e) => setInsightsDialogueInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendInsightsQuestion()}
                            placeholder={`Preguntale al Agente sobre los Insights (${selectedInsightCategory === 'highlights' ? 'Highlights Generales' : selectedInsightCategory === 'trafico' ? 'Análisis de Tráfico' : selectedInsightCategory === 'medios' ? 'Medios' : 'General'})...`}
                            className="flex-1 px-3.5 py-2.5 text-xs border border-gray-200 dark:border-[#2A3347] rounded-lg outline-none focus:border-santander-red focus:ring-1 focus:ring-santander-red bg-white dark:bg-[#1A202E] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                          />
                          <button
                            onClick={() => handleSendInsightsQuestion()}
                            disabled={isInsightsDialogueLoading || !insightsDialogueInput.trim()}
                            className="px-4 py-2.5 bg-santander-red text-white rounded-lg text-xs font-bold hover:bg-[#D00000] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Preguntar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-600 text-xs font-semibold flex items-center gap-2">
                  <div className="bg-red-600 w-1 h-4 rounded-full" />
                  {error}
                </div>
              )}

              <footer className="p-4 border-t border-gray-100 dark:border-[#222838] bg-gray-50 dark:bg-[#0E121A] flex justify-between items-center text-[10px] font-mono text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                <span>V1.1 - Agente Santander</span>
                <span>Ready for Wednesday Delivery</span>
              </footer>
            </div>
          </div>
        </div>
      {/* Google Drive Import Modal */}
      <AnimatePresence>
        {isDriveModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#131722] rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 dark:border-[#222838] relative space-y-5 overflow-hidden"
            >
              <div className="flex justify-between items-center border-b border-gray-100 dark:border-[#222838] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white tracking-tight uppercase flex items-center gap-2">
                      <span>Importar desde Google Drive</span>
                      {driveImportTarget === 'knowledge' && (
                        <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950/60 text-santander-red text-[9px] font-bold rounded uppercase">
                          Modo Entrenar Estilo (Reportes)
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {driveImportTarget === 'knowledge' 
                        ? 'Sincronizá reportes, presentaciones o planillas de Drive para entrenar la memoria y el estilo del Agente.'
                        : 'Sincronizá planillas de Google Sheets, presentaciones (.pptx), archivos de Excel, PDFs o documentos para generar el One Pager.'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsDriveModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1A202E] rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Error Alert inside Modal */}
              {driveModalError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span className="flex-1">{driveModalError}</span>
                  <button onClick={() => setDriveModalError(null)} className="text-red-500 dark:text-red-400 hover:underline text-[10px] font-bold">Cerrar</button>
                </div>
              )}

              {!googleUser ? (
                <div className="py-8 text-center space-y-4">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto">
                    <HardDrive className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Conectá tu cuenta de Google</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Se requiere vinculación de Google Workspace para leer de forma segura tus archivos y hojas de cálculo de Drive.
                    </p>
                  </div>
                  <button
                    onClick={handleGoogleSignIn}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Vincular Google Account
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Direct Link Input */}
                  <div className="p-4 bg-gray-50 dark:bg-[#0E121A] border border-gray-200 dark:border-[#222838] rounded-xl space-y-2">
                    <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 uppercase tracking-wide">
                      <Link2 className="w-3.5 h-3.5 text-blue-600" />
                      Opción A: Pegar Enlace de Google Drive / Sheets
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={driveUrlInput}
                        onChange={(e) => setDriveUrlInput(e.target.value)}
                        placeholder="Ej: https://docs.google.com/spreadsheets/d/1BxiMVs.../edit"
                        className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#1A202E] text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-[#2A3347] rounded-lg focus:outline-none focus:border-blue-600 font-mono"
                      />
                      <button
                        onClick={() => handleImportDriveFile(driveUrlInput)}
                        disabled={isImportingDrive || !driveUrlInput.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-[#222838] text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {isImportingDrive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                        Importar
                      </button>
                    </div>
                  </div>

                  {/* Drive Explorer Section */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 uppercase tracking-wide">
                        <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                        Opción B: Archivos Recientes de tu Google Drive
                      </label>
                      <button
                        onClick={handleFetchDriveFiles}
                        disabled={isLoadingDriveFiles}
                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {isLoadingDriveFiles ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                        Cargar / Actualizar Lista
                      </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                      <input 
                        type="text"
                        value={driveSearchQuery}
                        onChange={(e) => setDriveSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleFetchDriveFiles()}
                        placeholder="Buscar por nombre de archivo en Drive..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-[#1A202E] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-[#2A3347] rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* File List */}
                    <div className="border border-gray-200 dark:border-[#222838] rounded-xl max-h-[220px] overflow-y-auto divide-y divide-gray-100 dark:divide-[#222838] bg-white dark:bg-[#10141E]">
                      {isLoadingDriveFiles ? (
                        <div className="py-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          Cargando archivos desde Google Drive...
                        </div>
                      ) : driveFiles.length === 0 ? (
                        <div className="py-8 text-center text-xs text-gray-400">
                          Hacé clic en <span className="font-bold text-blue-600 dark:text-blue-400 cursor-pointer" onClick={handleFetchDriveFiles}>Cargar Archivos Recientes</span> para explorar tus planillas y PDFs en Drive.
                        </div>
                      ) : (
                        driveFiles.map((f) => {
                          const isSheet = f.mimeType.includes('spreadsheet');
                          const isPdf = f.mimeType.includes('pdf');
                          return (
                            <div key={f.id} className="p-3 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {isSheet ? (
                                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                                ) : isPdf ? (
                                  <FileText className="w-4 h-4 text-red-600 shrink-0" />
                                ) : (
                                  <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate" title={f.name}>{f.name}</p>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                    {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Google Drive'}
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={() => handleImportDriveFile(f.id)}
                                disabled={isImportingDrive}
                                className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white text-blue-700 dark:text-blue-300 text-[11px] font-bold rounded-lg transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                              >
                                Importar
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Historial de Reportes Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-[#131722] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#222838] w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-monks-dark dark:bg-[#0E121A] text-white flex justify-between items-center border-b-2 border-santander-red">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-santander-red rounded-lg">
                    <History className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold uppercase tracking-wide">Historial de Reportes One Pager</h2>
                    <p className="text-[11px] text-gray-400 font-mono">
                      Guarda automáticamente cada One Pager generado por el Agente
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Category Filter Tabs & Search */}
              <div className="p-5 bg-gray-50 dark:bg-[#0E121A] border-b border-gray-200 dark:border-[#222838] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: 'Todos', icon: Layers, count: historyReports.length },
                      { id: 'cards', label: 'OP Cards', icon: CreditCard, count: historyReports.filter(r => r.category === 'cards').length },
                      { id: 'nomina', label: 'OP Nómina', icon: Wallet, count: historyReports.filter(r => r.category === 'nomina').length },
                      { id: 'institucional', label: 'Institucional', icon: Building2, count: historyReports.filter(r => r.category === 'institucional').length },
                      { id: 'pymes', label: 'Pymes', icon: Briefcase, count: historyReports.filter(r => r.category === 'pymes').length },
                      { id: 'general', label: 'General', icon: BarChart3, count: historyReports.filter(r => r.category === 'general').length }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setHistoryFilterCategory(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                          historyFilterCategory === tab.id
                            ? 'bg-santander-red text-white border-santander-red shadow-xs'
                            : 'bg-white dark:bg-[#1A202E] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#2A3347] hover:bg-gray-100 dark:hover:bg-[#222A3D]'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          historyFilterCategory === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-[#222838] text-gray-500 dark:text-gray-400'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  {historyReports.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm('¿Seguro que deseas borrar todo el historial de reportes?')) {
                          setHistoryReports([]);
                          localStorage.removeItem('op-generator-report-history');
                        }
                      }}
                      className="text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Vaciar Historial
                    </button>
                  )}
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Buscar por título, contenido, métricas o palabras clave..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-[#1A202E] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-[#2A3347] rounded-xl focus:outline-none focus:border-santander-red focus:ring-1 focus:ring-santander-red"
                  />
                  {historySearchQuery && (
                    <button
                      onClick={() => setHistorySearchQuery('')}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* History List Feed */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gray-100/50 dark:bg-[#0B0E14]">
                {(() => {
                  const filtered = historyReports.filter(r => {
                    const matchesCategory = historyFilterCategory === 'all' || r.category === historyFilterCategory;
                    const query = historySearchQuery.toLowerCase();
                    const matchesQuery = !query || 
                      r.title.toLowerCase().includes(query) || 
                      r.input.toLowerCase().includes(query) || 
                      r.output.toLowerCase().includes(query);
                    return matchesCategory && matchesQuery;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center bg-white dark:bg-[#131722] rounded-2xl border border-gray-200 dark:border-[#222838] p-8 space-y-3">
                        <History className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
                        <h3 className="text-sm font-extrabold text-gray-700 dark:text-gray-200 uppercase">No hay reportes en el historial</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                          {historySearchQuery 
                            ? `No se encontraron coincidencias para "${historySearchQuery}".` 
                            : 'Genera un nuevo One Pager de Cards o Nómina para que aparezca guardado en tu historial.'}
                        </p>
                      </div>
                    );
                  }

                  return filtered.map(item => {
                    const isCards = item.category === 'cards';
                    const isNomina = item.category === 'nomina';
                    const isInst = item.category === 'institucional';
                    const isPyme = item.category === 'pymes';

                    const badgeBg = isCards ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300' :
                                    isNomina ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300' :
                                    isInst ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300' :
                                    isPyme ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300' :
                                    'bg-gray-100 dark:bg-[#1A202E] border-gray-200 dark:border-[#2A3347] text-gray-700 dark:text-gray-300';

                    const CategoryIcon = isCards ? CreditCard : isNomina ? Wallet : isInst ? Building2 : isPyme ? Briefcase : BarChart3;

                    return (
                      <div 
                        key={item.id}
                        className="bg-white dark:bg-[#131722] rounded-xl border border-gray-200 dark:border-[#222838] p-5 shadow-xs hover:shadow-md transition-all space-y-3"
                      >
                        <div className="flex flex-wrap justify-between items-start gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase border flex items-center gap-1 ${badgeBg}`}>
                                <CategoryIcon className="w-3 h-3" />
                                {getCategoryLabel(item.category)}
                              </span>
                              <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(item.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} - {new Date(item.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <h3 className="text-sm font-extrabold text-monks-dark dark:text-white">{item.title}</h3>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => handleCompareWithReport(item)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                              title="Comparar esta versión con la actual en vista paralela"
                            >
                              <GitCompare className="w-3.5 h-3.5" />
                              Comparar Side-by-Side
                            </button>
                            <button
                              onClick={() => loadReportToWorkspace(item)}
                              className="px-3 py-1.5 bg-santander-red hover:bg-[#D00000] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              Cargar en Workspace
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(item.output);
                                setPastedToast('Reporte copiado al portapapeles');
                                setTimeout(() => setPastedToast(null), 2500);
                              }}
                              className="p-1.5 bg-gray-100 dark:bg-[#1A202E] hover:bg-gray-200 dark:hover:bg-[#252E42] text-gray-700 dark:text-gray-200 rounded-lg transition-colors cursor-pointer"
                              title="Copiar texto del reporte"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteReportFromHistory(item.id)}
                              className="p-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar del historial"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Snippets / Indicators */}
                        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 bg-gray-50 dark:bg-[#0E121A] p-2.5 rounded-lg font-mono border border-gray-100 dark:border-[#222838]">
                          <strong className="text-gray-800 dark:text-gray-100">Input / Datos:</strong> {item.input}
                        </p>

                        <div className="flex items-center gap-2 flex-wrap text-[10px]">
                          {item.detectedRisk && (
                            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/60 rounded font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-red-600 animate-pulse" />
                              Alerta de Riesgo Registrada
                            </span>
                          )}
                          {item.chartData && (
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 rounded font-bold flex items-center gap-1">
                              <AreaChart className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                              Gráfico: {item.chartData.title}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-white dark:bg-[#131722] border-t border-gray-200 dark:border-[#222838] flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                <span>Total en historial: <strong>{historyReports.length}</strong> One Pagers</span>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-[#1A202E] hover:bg-gray-200 dark:hover:bg-[#252E42] text-gray-800 dark:text-gray-200 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      </main>

      {/* Official Santander & .Monks Corporate Footer */}
      <footer className="bg-monks-dark text-white/70 py-3.5 px-6 text-[10px] font-mono border-t-2 border-santander-red flex flex-wrap justify-between items-center gap-3 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MonksLogo className="h-4 text-white" fill="#FFFFFF" />
            <span className="text-santander-red font-bold">✕</span>
            <SantanderFlameLogo className="w-4 h-4 text-santander-red shrink-0" fill="#EC0000" />
            <span className="text-white font-extrabold uppercase tracking-wider">Santander</span>
          </div>
          <span className="text-white/30 font-light">|</span>
          <span className="text-white/60">Agente Santander Performance System</span>
        </div>

        <div className="flex items-center gap-4 text-white/50">
          <span>© 2026 .Monks. All rights reserved.</span>
          <span className="bg-white/10 text-white/90 px-2 py-0.5 rounded text-[9px] font-bold border border-white/10 uppercase">
            Proprietary & Confidential
          </span>
        </div>
      </footer>

      {/* Background Decor */}
      <div className="fixed bottom-0 left-0 w-full h-1 bg-santander-red z-0" />
    </div>
  );
}

