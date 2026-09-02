/**
 * Untrusted Content Isolation and Prompt Injection Defense Utility
 */

export const UNTRUSTED_OPEN_TAG = '<<<UNTRUSTED_DATA_START>>>';
export const UNTRUSTED_CLOSE_TAG = '<<<UNTRUSTED_DATA_END>>>';

export function sanitizeUntrustedContent(content: string): string {
  if (!content) return '';
  return content
    .replace(/<<<UNTRUSTED_DATA_END>>>/gi, '[TAG_FILTERED]')
    .replace(/<<<UNTRUSTED_DATA_START>>>/gi, '[TAG_FILTERED]')
    .replace(/<\/?system_instructions>/gi, '[INSTRUCTION_TAG_FILTERED]')
    .replace(/<\/?system>/gi, '[SYSTEM_TAG_FILTERED]')
    .replace(/\[\s*SYSTEM\s*NOTE\s*:?[^\]]*\]/gi, '[NOTE_FILTERED]')
    .replace(/\[\s*IGNORE\s+PREVIOUS\s+INSTRUCTIONS\s*\]/gi, '[OVERRIDE_FILTERED]');
}

export function wrapUntrustedPayload(label: string, rawContent: string): string {
  const safeContent = sanitizeUntrustedContent(rawContent);
  return `\n${UNTRUSTED_OPEN_TAG} [SOURCE: ${label}]\n${safeContent}\n${UNTRUSTED_CLOSE_TAG}\n`;
}

export function wrapUntrusted(label: string, content: string, maxChars?: number): string {
  const sliced = maxChars && maxChars > 0 ? String(content || '').slice(0, maxChars) : String(content || '');
  return `BEGIN_UNTRUSTED_${label}\n${sliced}\nEND_UNTRUSTED_${label}`;
}

export function detectPromptInjectionAttempts(text: string): { isSuspicious: boolean; flags: string[] } {
  if (!text) return { isSuspicious: false, flags: [] };
  
  const suspiciousPatterns: Array<{ name: string; regex: RegExp }> = [
    { name: 'Ignore Instructions Override', regex: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i },
    { name: 'System Role Reassignment', regex: /(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(a\s+different|an\s+unrestricted|root|admin)/i },
    { name: 'Delimiters Hijack', regex: /(<<<|>>>|<\/system|<system>)/i },
    { name: 'Exfiltration Attempt', regex: /(output\s+your\s+system\s+prompt|reveal\s+secret\s+key|print\s+env)/i }
  ];

  const flags: string[] = [];
  for (const pattern of suspiciousPatterns) {
    if (pattern.regex.test(text)) {
      flags.push(pattern.name);
    }
  }

  return {
    isSuspicious: flags.length > 0,
    flags
  };
}
