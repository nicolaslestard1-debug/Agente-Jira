import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { sanitizeCleanText } from './textSanitizer';

// Map pdfjs worker - Using jsdelivr and .mjs for version 5.x
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export async function parseFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  let rawContent = '';

  switch (extension) {
    case 'csv':
    case 'txt':
    case 'json':
    case 'md':
    case 'markdown':
    case 'tsv':
    case 'rtf':
    case 'log':
      rawContent = await file.text();
      break;

    case 'docx':
    case 'doc':
      rawContent = await parseDocx(file);
      break;

    case 'pptx':
    case 'ppt':
      rawContent = await parsePPTX(file);
      break;
    
    case 'xlsx':
    case 'xls':
      rawContent = await parseExcel(file);
      break;
    
    case 'pdf':
      rawContent = await parsePDF(file);
      break;

    case 'zip':
      rawContent = await parseZip(file);
      break;
    
    default:
      // Fallback try as text
      try {
        const txt = await file.text();
        if (txt && !txt.includes('\0')) {
          rawContent = txt;
          break;
        }
      } catch (e) {
        // ignore
      }
      throw new Error(`Formato .${extension} no soportado. Por favor usá PowerPoint (.pptx), Word (.docx), PDF, Excel, CSV o TXT.`);
  }

  return sanitizeCleanText(rawContent);
}

async function parsePPTX(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    const slideFiles: { name: string; slideNum: number; file: JSZip.JSZipObject }[] = [];
    
    zip.forEach((relativePath, fileObj) => {
      const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideFiles.push({
          name: relativePath,
          slideNum: parseInt(match[1], 10),
          file: fileObj
        });
      }
    });

    slideFiles.sort((a, b) => a.slideNum - b.slideNum);

    if (slideFiles.length === 0) {
      return await file.text();
    }

    let fullText = `[PRESENTACIÓN POWERPOINT (.pptx): ${file.name} - ${slideFiles.length} diapositiva(s)]\n\n`;

    for (const slide of slideFiles) {
      const xmlText = await slide.file.async('text');
      // Extract text content inside PowerPoint text elements <a:t>...</a:t> and fallback to any tags containing text
      const matches = xmlText.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi) || xmlText.match(/<t[^>]*>([\s\S]*?)<\/t>/gi);
      let slideText = '';
      if (matches && matches.length > 0) {
        slideText = matches
          .map(m => m.replace(/<[^>]+>/g, '').trim())
          .filter(t => t.length > 0)
          .join(' ');
      } else {
        // Fallback: strip XML tags from the entire slide XML
        slideText = xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      if (slideText) {
        fullText += `--- Diapositiva ${slide.slideNum} ---\n${slideText}\n\n`;
      }
    }

    return fullText;
  } catch (err) {
    console.warn("PPTX parsing fallback to raw text:", err);
    return await file.text();
  }
}

async function parseDocx(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (result.value && result.value.trim().length > 0) {
      return result.value;
    }
  } catch (err) {
    console.warn("Mammoth docx parsing fallback to raw text:", err);
  }
  // Fallback to text reading
  return await file.text();
}

async function parseExcel(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  let content = '';
  
  // Limit to first 5 sheets to avoid massive Excel structures
  const maxSheets = 5;
  const sheetNamesToProcess = workbook.SheetNames.slice(0, maxSheets);
  
  if (workbook.SheetNames.length > maxSheets) {
    content += `[AVISO DE CONTROL DE TAMAÑO: El archivo tiene ${workbook.SheetNames.length} pestañas. Solo se procesaron las primeras ${maxSheets} por eficiencia]\n\n`;
  }
  
  sheetNamesToProcess.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    content += `Sheet: ${sheetName}\n`;
    content += XLSX.utils.sheet_to_csv(sheet);
    content += '\n---\n';
  });
  
  // Truncate to a safe maximum characters limit (e.g. 120,000 chars)
  const maxChars = 120000;
  if (content.length > maxChars) {
    content = content.substring(0, maxChars) + `\n\n[AVISO: El contenido de Excel fue truncado a ${maxChars} caracteres para optimizar el análisis de performance]`;
  }
  
  return content;
}

async function parsePDF(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  let fullText = '';
  
  const maxPages = 15;
  const pagesToProcess = Math.min(pdf.numPages, maxPages);
  
  if (pdf.numPages > maxPages) {
    fullText += `[AVISO DE CONTROL DE TAMAÑO: El archivo PDF contiene ${pdf.numPages} páginas. Por motivos de optimización, solo se extrajeron las primeras ${maxPages} páginas]\n\n`;
  }
  
  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += `Página ${i}:\n${pageText}\n\n`;
  }
  
  return fullText;
}

async function parseZip(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    let combinedContent = `[PAQUETE ZIP DESCOMPRIMIDO (${file.name})]\n\n`;
    let extractedCount = 0;

    const validEntries = Object.keys(zip.files).filter(filename => {
      const isDir = zip.files[filename].dir;
      const isHidden = filename.startsWith('__MACOSX') || filename.split('/').some(part => part.startsWith('.'));
      return !isDir && !isHidden;
    });

    if (validEntries.length === 0) {
      return `[ARCHIVO ZIP VACÍO O SIN CONTENIDO EXTRAÍBLE: ${file.name}]`;
    }

    for (const filename of validEntries) {
      const zipObj = zip.files[filename];
      const extension = filename.split('.').pop()?.toLowerCase() || '';
      const baseName = filename.split('/').pop() || filename;

      if (extension === 'zip') continue;

      try {
        let textContent = '';
        if (['csv', 'txt', 'json', 'md', 'markdown', 'tsv', 'rtf', 'log'].includes(extension)) {
          textContent = await zipObj.async('text');
        } else if (['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'].includes(extension)) {
          const blob = await zipObj.async('blob');
          const subFile = new File([blob], baseName, { type: blob.type || 'application/octet-stream' });
          textContent = await parseFile(subFile);
        } else {
          try {
            const rawText = await zipObj.async('text');
            if (rawText && !rawText.includes('\0')) {
              textContent = rawText;
            }
          } catch {
            // ignore unsupported binary
          }
        }

        if (textContent && textContent.trim()) {
          extractedCount++;
          combinedContent += `--- DOCUMENTO ${extractedCount} DENTRO DEL ZIP: ${filename} ---\n`;
          combinedContent += `${textContent.trim()}\n\n`;
        }
      } catch (subErr) {
        console.warn(`Error al procesar el archivo "${filename}" dentro del ZIP:`, subErr);
      }
    }

    if (extractedCount === 0) {
      return `[NO SE ENCONTRARON DOCUMENTOS SOPORTADOS (PDF, Excel, Word, PPTX, CSV, TXT) DENTRO DEL ARCHIVO ZIP: ${file.name}]`;
    }

    combinedContent += `[FIN DEL ARCHIVO ZIP: Se extrajeron exitosamente ${extractedCount} archivo(s)]`;
    return combinedContent;
  } catch (err: any) {
    console.error("Error al descomprimir el archivo ZIP:", err);
    throw new Error(`Error al leer el paquete .zip "${file.name}". Asegurate de que el archivo no esté corrupto.`);
  }
}
