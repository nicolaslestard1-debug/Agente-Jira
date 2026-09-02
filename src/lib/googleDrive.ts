import { parseFile } from './fileParser';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  iconLink?: string;
  webViewLink?: string;
  size?: string;
}

/**
 * Extracts a file/spreadsheet ID from various Google Drive & Google Sheets URLs.
 * e.g., https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * e.g., https://drive.google.com/file/d/1a2b3c4d5e6f/view
 */
export function extractGoogleDriveId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  
  // Direct ID check (e.g., 33+ alphanumeric characters)
  if (/^[a-zA-Z0-9-_]{25,}$/.test(trimmed)) {
    return trimmed;
  }

  // URL matching pattern
  const match = trimmed.match(/\/(?:spreadsheets|document|file)\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }

  const openMatch = trimmed.match(/id=([a-zA-Z0-9-_]+)/);
  if (openMatch && openMatch[1]) {
    return openMatch[1];
  }

  return null;
}

/**
 * List recent files from Google Drive (Spreadsheets, Excels, PDFs, Docs, CSVs)
 */
export async function listGoogleDriveFiles(accessToken: string, querySearch: string = ''): Promise<DriveFile[]> {
  try {
    let q = "trashed = false and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/pdf' or mimeType = 'text/csv' or mimeType = 'application/vnd.ms-excel')";
    
    if (querySearch.trim()) {
      const sanitized = querySearch.replace(/'/g, "\\'");
      q = `trashed = false and name contains '${sanitized}'`;
    }

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('pageSize', '20');
    url.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, iconLink, webViewLink, size)');
    url.searchParams.set('orderBy', 'modifiedTime desc');

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Error al listar Google Drive: ${err}`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (error: any) {
    console.error('Drive listing error:', error);
    throw error;
  }
}

/**
 * Fetch metadata for a specific file ID
 */
export async function getGoogleDriveFileMetadata(accessToken: string, fileId: string): Promise<DriveFile> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,webViewLink,size`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error('No se pudo obtener la información del archivo en Google Drive. Verifica que el enlace sea válido y tengas permisos de acceso.');
  }

  return await res.json();
}

/**
 * Import and parse content of a file from Google Drive (Google Sheet, Excel, PDF, Doc, CSV)
 */
export async function importGoogleDriveFile(accessToken: string, fileIdOrUrl: string): Promise<{ name: string; content: string; mimeType: string }> {
  const fileId = extractGoogleDriveId(fileIdOrUrl);
  if (!fileId) {
    throw new Error('El enlace o ID de Google Drive ingresado no es válido.');
  }

  const meta = await getGoogleDriveFileMetadata(accessToken, fileId);
  const mimeType = meta.mimeType;
  let parsedContent = '';

  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    // Export Google Sheets as CSV directly from Drive API
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    const res = await fetch(exportUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      // Fallback to Google Sheets API values batchGet if export fails
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}?includeGridData=true`;
      const sheetsRes = await fetch(sheetsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!sheetsRes.ok) {
        throw new Error('No se pudo acceder a la planilla de Google Sheets.');
      }

      const spreadsheetData = await sheetsRes.json();
      let sheetText = `[GOOGLE SHEETS IMPORTADO: ${meta.name}]\n\n`;

      if (spreadsheetData.sheets) {
        spreadsheetData.sheets.forEach((s: any) => {
          const sheetTitle = s.properties?.title || 'Hoja';
          sheetText += `Sheet: ${sheetTitle}\n`;
          const rowData = s.data?.[0]?.rowData;
          if (rowData) {
            rowData.forEach((row: any) => {
              const values = (row.values || []).map((cell: any) => cell.formattedValue || cell.userEnteredValue?.stringValue || '').join(',');
              sheetText += values + '\n';
            });
          }
          sheetText += '\n---\n';
        });
      }
      parsedContent = sheetText;
    } else {
      const csvText = await res.text();
      parsedContent = `[GOOGLE SHEETS IMPORTADO: ${meta.name}]\n\n` + csvText;
    }
  } else if (mimeType === 'application/vnd.google-apps.document') {
    // Export Google Docs as plain text
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    const res = await fetch(exportUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      throw new Error('No se pudo exportar el documento de Google Docs.');
    }

    parsedContent = await res.text();
  } else {
    // Binary/Standard files stored in Drive (Excel .xlsx, PDF, CSV, TXT)
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      throw new Error('No se pudo descargar el archivo binario desde Google Drive.');
    }

    const blob = await res.blob();
    // Convert blob to File instance for fileParser.ts
    const file = new File([blob], meta.name, { type: meta.mimeType || 'application/octet-stream' });
    parsedContent = await parseFile(file);
  }

  return {
    name: meta.name,
    content: parsedContent,
    mimeType: meta.mimeType
  };
}
