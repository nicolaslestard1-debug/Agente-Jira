/**
 * Formateo y utilidades para números y divisas en formato corporativo México (Santander MX)
 * Formatos estándar:
 * - Moneda: $1,234.56 MXN o $1.25M
 * - Millones: $1.25M / $3.40M
 * - Porcentajes: 14.5% o +12.3% MoM
 * - Separadores: coma (,) para miles y punto (.) para decimales
 */

/**
 * Formatea un número en moneda MXN según directrices de Santander México
 */
export function formatMexicanCurrency(value: number, abbreviateMillions: boolean = false): string {
  if (isNaN(value)) return '$0';

  if (abbreviateMillions && Math.abs(value) >= 1_000_000) {
    const millions = (value / 1_000_000).toFixed(2);
    return `$${millions}M`;
  }

  if (abbreviateMillions && Math.abs(value) >= 1_000) {
    const thousands = (value / 1_000).toFixed(1);
    return `$${thousands}K`;
  }

  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Formatea porcentaje con signo explícito y un decimal
 */
export function formatPercentage(value: number, includeSign: boolean = false): string {
  if (isNaN(value)) return '0%';
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Limpia y parsea números escritos en español/inglés
 */
export function parseNumericString(input: string): number | null {
  if (!input) return null;
  const cleaned = input
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim();

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}
