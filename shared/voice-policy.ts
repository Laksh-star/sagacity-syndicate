import type { VoiceInterruptionAssessment } from "./schemas.js";

export type LocalVoiceIntent = "acknowledgement" | "status" | "follow_up" | "possible_change";
export type InterruptionAction = "continue" | "clarify" | "reconvene";

const normalized = (text: string) => text.toLowerCase().trim().replace(/[.!?,]+$/u, "").replace(/\s+/gu, " ");
const acknowledgements = new Set(["okay", "ok", "right", "go on", "hmm", "hm", "interesting", "sure", "got it", "yes", "yeah"]);

export function classifyLocalVoiceIntent(text: string, hasDecision: boolean): LocalVoiceIntent {
  const value = normalized(text);
  if (acknowledgements.has(value)) return "acknowledgement";
  if (/^(how long|what are they doing|what is the council doing|are they done|is it done|any update)/u.test(value)) return "status";
  if (hasDecision && /^(why|how|what did|what made|what assumption|when should|when do|explain|tell me about|why is confidence)/u.test(value)) return "follow_up";
  return "possible_change";
}

export function obviousNonMaterialAssessment(text: string, hasDecision: boolean): VoiceInterruptionAssessment | undefined {
  const intent = classifyLocalVoiceIntent(text, hasDecision);
  if (intent === "possible_change") return undefined;
  const reason = intent === "acknowledgement"
    ? "This is a conversational acknowledgement, not a changed decision fact."
    : intent === "status"
      ? "This is a process question, not a changed decision fact."
      : "This asks about the verified decision and does not introduce a changed constraint.";
  return { material: false, reason, confidence: 0.99 };
}

export function interruptionAction(assessment: VoiceInterruptionAssessment): InterruptionAction {
  if (assessment.material && assessment.changedConstraint && assessment.confidence >= 0.65) return "reconvene";
  if (assessment.material || assessment.confidence < 0.65) return "clarify";
  return "continue";
}
