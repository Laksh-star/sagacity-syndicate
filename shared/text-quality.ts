const DANGLING_CONNECTOR = /\b(?:and|or|but|with|to|for|of|the|a|an)\s*([.!?])$/iu;
const TRAILING_PUNCTUATION_COLLISION = /[,;:]\s*([.!?])$/u;
const SPACE_BEFORE_FINAL_PUNCTUATION = /\s+([.!?])$/u;
const SERIALIZATION_DEBRIS = [
  /`["']?\s*,\s*["']/u,
  /\]\}\s*,\s*\]\}/u,
];

/**
 * Repairs only obvious mechanical prose damage. It never invents content or
 * resolves a substantive ambiguity; unsafe semantic output still fails closed.
 */
export function cleanMechanicalProse(value: string): string {
  let cleaned = value.trim();
  const debrisAt = SERIALIZATION_DEBRIS
    .map((pattern) => cleaned.search(pattern))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (debrisAt !== undefined) cleaned = cleaned.slice(0, debrisAt).trim();

  cleaned = cleaned
    .replace(DANGLING_CONNECTOR, "$1")
    .replace(TRAILING_PUNCTUATION_COLLISION, "$1")
    .replace(SPACE_BEFORE_FINAL_PUNCTUATION, "$1")
    .trim();

  if (cleaned && !/[.!?]$/u.test(cleaned)) cleaned = `${cleaned.replace(/[\s,:;\-–—]+$/gu, "")}.`;
  return cleaned;
}

export function hasMechanicalProseDefect(value: string): boolean {
  return cleanMechanicalProse(value) !== value.trim();
}
