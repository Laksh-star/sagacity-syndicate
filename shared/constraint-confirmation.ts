import { ConstraintConfirmationSchema, type ConstraintConfirmation, type VoiceInterruptionAssessment } from "./schemas.js";

export type ConfirmationReply = "accept" | "reject" | "replace";

const normalizedReply = (text: string) => text.toLowerCase().trim().replace(/[.!?,]+$/gu, "").replace(/\s+/gu, " ");
const acceptReplies = new Set(["yes", "yeah", "yep", "correct", "that's right", "that is right", "right", "confirmed", "confirm", "exactly"]);
const rejectReplies = new Set(["no", "nope", "incorrect", "that's wrong", "that is wrong", "not right", "wrong"]);

export function classifyConfirmationReply(text: string): ConfirmationReply {
  const value = normalizedReply(text);
  if (acceptReplies.has(value) || /^(yes|correct|right|confirmed)\b/iu.test(value)) return "accept";
  if (rejectReplies.has(value) || /^(no|incorrect|wrong)\b/iu.test(value)) return "reject";
  return "replace";
}

const cleanedValue = (value: string) => value.trim().replace(/^[,:;\-–—\s]+|[,:;\-–—\s]+$/gu, "").slice(0, 160);

function currentValue(left: string): string {
  const marker = [...left.matchAll(/\b(?:is|becomes?|now|actually)\b/giu)].at(-1);
  const afterMarker = marker?.index !== undefined ? left.slice(marker.index + marker[0].length) : left;
  return cleanedValue(afterMarker.replace(/^\s*(?:is|now|actually)\s+/iu, ""));
}

function replacementValues(text: string): { newValue?: string; previousValue?: string } {
  const crossSentence = text.match(/^(.+?)[.!?]\s*(?:this|it)\s+replaces?\s+(.+?)[.!?]*$/iu);
  if (crossSentence) {
    const newValue = currentValue(crossSentence[1]);
    const previousValue = cleanedValue(crossSentence[2].replace(/^the\s+(?:earlier|previous|old)\s+/iu, ""));
    if (newValue && previousValue) return { newValue, previousValue };
  }

  const replacement = text.match(/^(.+?)[,;]?\s+(?:instead of|replaces?|replacing)\s+(.+?)[.!?]*$/iu);
  if (replacement) {
    const newValue = currentValue(replacement[1]);
    const previousValue = cleanedValue(replacement[2].replace(/^the\s+(?:earlier|previous|old)\s+/iu, ""));
    if (newValue && previousValue) return { newValue, previousValue };
  }

  const not = text.match(/^(.+?),\s*not\s+(.+?)[.!?]*$/iu);
  if (not) {
    const newValue = currentValue(not[1]);
    const previousValue = cleanedValue(not[2]);
    if (newValue && previousValue) return { newValue, previousValue };
  }
  return {};
}

export function createConstraintConfirmation(
  assessment: VoiceInterruptionAssessment,
  conversationRevision: number,
  createdAt = Date.now(),
): ConstraintConfirmation {
  if (!assessment.material || !assessment.changedConstraint) throw new Error("Only a material changed constraint can be confirmed.");
  const changedConstraint = assessment.changedConstraint.trim().slice(0, 400);
  const values = replacementValues(changedConstraint);
  const directional = values.newValue && values.previousValue
    ? `I understood the new value as ${values.newValue}, replacing ${values.previousValue}.`
    : `I understood the material change as: ${changedConstraint.replace(/[.!?]+$/u, "")}.`;
  return ConstraintConfirmationSchema.parse({
    changedConstraint,
    confirmationQuestion: `${directional} Is that correct?`,
    ...values,
    interpretationConfidence: assessment.confidence,
    conversationRevision,
    createdAt,
  });
}

export function confirmationPrompt(confirmation: ConstraintConfirmation): string {
  return [
    "The application has paused before reconvening because this is a material change.",
    confirmation.confirmationQuestion,
    "Ask only that brief confirmation question. Do not delegate, cancel council work, or claim reconvening has started until the application confirms it.",
  ].join(" ");
}
