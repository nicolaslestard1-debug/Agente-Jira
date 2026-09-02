export const MAX_INPUT_CHARS = 100_000;
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_CHAT_HISTORY_ITEMS = 30;
export const MAX_SCREENSHOTS = 5;
export const MAX_CONTEXT_CHARS = 120_000;
export const MAX_EXAMPLES = 12;
export const MAX_EXAMPLE_INPUT_CHARS = 10_000;
export const MAX_EXAMPLE_OUTPUT_CHARS = 15_000;
export const MAX_JSON_BYTES = "50mb";
export const MAX_SCREENSHOT_CHARS = 5_000_000;
export const MAX_HISTORY_INPUT_CHARS = 1500;
export const MAX_HISTORY_ITEMS = 100;

export function validatePayloadSize(input: string): { valid: boolean; length: number; message?: string } {
  const length = input ? input.length : 0;
  if (length > MAX_INPUT_CHARS) {
    return {
      valid: false,
      length,
      message: `El texto ingresado (${length.toLocaleString()} caracteres) supera el límite máximo recomendado de ${MAX_INPUT_CHARS.toLocaleString()} caracteres.`
    };
  }
  return { valid: true, length };
}
