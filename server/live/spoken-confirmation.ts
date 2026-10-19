const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function words(n: number): string {
  if (n < 20) return small[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ` ${words(n % 10)}` : "");
  for (const [size, label] of [[10_000_000, "crore"], [100_000, "lakh"], [1_000, "thousand"], [100, "hundred"]] as const) {
    if (n >= size) return `${words(Math.floor(n / size))} ${label}${n % size ? ` ${words(n % size)}` : ""}`;
  }
  return "";
}
/** Speech-only, deterministic INR spelling. Never mutate the captured/council text.
 * Leave malformed grouping, oversized amounts and unrelated numbers untouched. */
export function spokenConfirmationQuestion(original: string): string {
  return original.replace(/(?:₹\s*|\bINR\s+|\bRs\.?\s+)([\d,]+(?:\.\d+)?)(?![\d,.])/gu, (whole, amount: string) => {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(amount)) return whole;
    const [integer, fraction] = amount.replaceAll(",", "").split(".");
    const value = Number(integer);
    if (!Number.isSafeInteger(value) || value > 999_999_999) return whole;
    const paise = fraction ? Number(fraction.padEnd(2, "0")) : 0;
    return `${words(value)} ${value === 1 ? "rupee" : "rupees"}${paise ? ` and ${words(paise)} ${paise === 1 ? "paisa" : "paise"}` : ""}`;
  });
}
