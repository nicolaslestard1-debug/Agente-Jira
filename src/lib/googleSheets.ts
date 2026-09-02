import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Reuse or initialize the Firebase App safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// We add the Google Sheets & Google Drive scopes to allow spreadsheet and Drive file read/write
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Clear token cache if we don't have it in memory already
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Google sign in popup logic
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Error de autenticación Google Sheets:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export interface SheetExportData {
  title: string;
  markdownContent: string;
  chartData: {
    title: string;
    type: string;
    data: { name: string; value: number }[];
  } | null;
  kpiPanel?: {
    scorecards: { section: string; label: string; valueLabel: string; numericValue?: number; unit?: string; delta?: string }[];
    charts: { title: string; type: string; section?: string; unit?: string; data: { name: string; value: number }[] }[];
  } | null;
}

/**
 * Creates a Google Spreadsheet for Looker Studio, writing the executive summary and tabular metrics data
 */
export const createAndPopulateSpreadsheet = async (
  accessToken: string,
  exportData: SheetExportData
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  const dateStr = new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // 1. Setup the request body for spreadsheet creation
  const createPayload = {
    properties: {
      title: `Reporte Santander - ${exportData.title || 'Performance'}`
    },
    sheets: [
      {
        properties: {
          title: 'Resumen Ejecutivo'
        }
      },
      {
        properties: {
          title: 'Dato de Métricas (Looker Studio)'
        }
      }
    ]
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createPayload)
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Error al crear la hoja de cálculo: ${errorText}`);
  }

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const spreadsheetUrl = spreadsheet.spreadsheetUrl;

  // 2. Prepare Tab 1 values (Resumen Ejecutivo)
  // Parse insights dynamically by splitting markdown lines
  const rawLines = exportData.markdownContent.split('\n');
  const summaryRows: any[][] = [
    ['REPORTE EJECUTIVO DE PERFORMANCE - SANTANDER MÉXICO'],
    ['Generado automáticamente por el Agente de Inteligencia de Performance'],
    ['Fecha de Registro:', dateStr],
    [],
    ['Sección / Párrafo', 'Contenido Detallado']
  ];

  let currentHeading = 'Configuración General';
  rawLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('#')) {
      currentHeading = trimmed.replace(/#+\s*/, '').toUpperCase();
      summaryRows.push([currentHeading, '']);
    } else {
      // Clean up markdown bullet points / formatting from contents before exporting to spreadsheet cells
      const cleanedText = trimmed.replace(/^[-*+]\s*/, '').replace(/\*\*|__/g, '');
      summaryRows.push(['', cleanedText]);
    }
  });

  // 3. Prepare Tab 2 values (Looker Studio Tabular Metrics)
  const metricsRows: any[][] = [
    ['Sección', 'Tipo', 'Canal / KPI', 'Valor Numérico', 'Etiqueta', 'Unidad', 'Delta', 'Fecha de Registro', 'Gráfico']
  ];

  const panel = exportData.kpiPanel;
  if (panel?.scorecards?.length) {
    panel.scorecards.forEach((card) => {
      metricsRows.push([
        card.section,
        'scorecard',
        card.label,
        card.numericValue ?? '',
        card.valueLabel,
        card.unit || '',
        card.delta || '',
        dateStr,
        ''
      ]);
    });
  }
  const charts = panel?.charts?.length ? panel.charts : (exportData.chartData ? [exportData.chartData] : []);
  if (charts.length > 0) {
    charts.forEach((chart) => {
      (chart.data || []).forEach((row) => {
        metricsRows.push([
          (chart as { section?: string }).section || '',
          'chart',
          row.name,
          row.value,
          '',
          (chart as { unit?: string }).unit || '',
          '',
          dateStr,
          `${chart.type}: ${chart.title}`
        ]);
      });
    });
  }
  if (metricsRows.length === 1) {
    metricsRows.push(['', '', 'Sin métricas estructuradas cargadas', 0, '', '', '', dateStr, 'N/A']);
  }

  // 4. Perform Bach Update of Cell values in the Spreadsheet
  const dataPayload = {
    valueInputOption: 'USER_ENTERED',
    data: [
      {
        range: 'Resumen Ejecutivo!A1',
        values: summaryRows
      },
      {
        range: 'Dato de Métricas (Looker Studio)!A1',
        values: metricsRows
      }
    ]
  };

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataPayload)
    }
  );

  if (!updateRes.ok) {
    const errorText = await updateRes.text();
    throw new Error(`Error al cargar datos en la hoja de cálculo: ${errorText}`);
  }

  return { spreadsheetId, spreadsheetUrl };
};
