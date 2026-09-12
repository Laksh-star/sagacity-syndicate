import type { VoiceTurn } from "./turn-tracker.js";

export function buildVoiceDecisionContext(
  typedContext: string,
  turns: VoiceTurn[],
  causalTurn?: VoiceTurn,
): string {
  const completed = turns.filter((turn) => turn.complete && turn.text.trim()).slice(-12);
  const includesCausal = causalTurn && completed.some((turn) => turn.id === causalTurn.id);
  const effectiveTurns = causalTurn?.text.trim() && !includesCausal ? [...completed, causalTurn] : completed;
  const voiceContext = effectiveTurns
    .map((turn) => `${turn.role === "user" ? "User" : "Sutradhara"}: ${turn.text.trim()}`)
    .join("\n");
  return [typedContext.trim(), voiceContext && `Voice conversation:\n${voiceContext}`]
    .filter(Boolean)
    .join("\n\n");
}
