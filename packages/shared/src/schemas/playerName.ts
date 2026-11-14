const MAX_NAME_LENGTH = 16;

/** Strips control/markup characters and clamps length. Used by both client and server. */
export function sanitizePlayerName(raw: unknown, fallback = 'Rider'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _\-.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned.length >= 2 ? cleaned : fallback;
}
