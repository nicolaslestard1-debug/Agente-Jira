/**
 * Text Sanitizer Utility
 * Sanitizes text from LLM outputs, clipboard copies, and file imports.
 * Filters zero-width spaces, directional marks, invisible Unicode anomalies,
 * and normalizes irregular whitespace without altering numbers or Markdown formatting.
 */

// Zero-width & invisible format characters
const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g;

// Unwanted ASCII control characters (keeps \t \n \r)
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Non-standard Unicode spaces to normalize to standard ASCII space
const UNICODE_SPACES_REGEX = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Strips invisible Unicode characters, control artifacts, and normalizes strange whitespace.
 * @param text Input string
 * @returns Cleaned, human-readable string
 */
export function sanitizeCleanText(text: string): string {
  if (!text) return '';
  return text
    // 1. Remove zero-width characters, BOM, directional marks, soft hyphens
    .replace(INVISIBLE_CHARS_REGEX, '')
    // 2. Remove non-printable control characters
    .replace(CONTROL_CHARS_REGEX, '')
    // 3. Normalize non-standard spaces to standard space
    .replace(UNICODE_SPACES_REGEX, ' ')
    // 4. Standardize Windows \r\n to standard \n
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Sanitizes text specifically tailored for copying to PowerPoint / Word clipboards.
 * Ensures clean bullet points, trims end-of-line trailing whitespace, and eliminates invisible artifacts.
 * @param text Block or section string
 * @returns Cleaned text ready for clipboard pasting
 */
export function sanitizeForClipboard(text: string): string {
  if (!text) return '';
  const cleaned = sanitizeCleanText(text);
  // Clean trailing spaces per line
  return cleaned
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Diagnostics function to count how many invisible or irregular characters were removed.
 */
export function countInvisibleCharacters(text: string): number {
  if (!text) return 0;
  const invisibleMatches = text.match(INVISIBLE_CHARS_REGEX);
  const controlMatches = text.match(CONTROL_CHARS_REGEX);
  const spacesMatches = text.match(UNICODE_SPACES_REGEX);
  return (invisibleMatches?.length || 0) + (controlMatches?.length || 0) + (spacesMatches?.length || 0);
}
