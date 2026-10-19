export type DecisionPresentation = {
  question?: string;
  recommendation: string;
};

/** Separates a preserved decision question from its recommendation for display. */
export function decisionPresentation(decision: string): DecisionPresentation {
  const match = decision.trim().match(/^(.*?\?)\s*(?:Decision|Recommendation):\s*(.+)$/isu);
  if (!match) return { recommendation: decision };
  return { question: match[1].trim(), recommendation: match[2].trim() };
}
