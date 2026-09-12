import { VoiceBriefSchema, type DecisionScroll, type VoiceBrief } from "./schemas.js";

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean);

function firstSentences(text: string, maximumWords: number, prefer?: RegExp): string {
  const sentences = text.match(/[^.!?]+[.!?]+/gu)?.map((sentence) => sentence.trim()) ?? [text.trim()];
  const preferred = prefer ? sentences.find((sentence) => prefer.test(sentence)) : undefined;
  const ordered = preferred ? [preferred, ...sentences.filter((sentence) => sentence !== preferred)] : sentences;
  let selected = "";
  for (const sentence of ordered) {
    const candidate = [selected, sentence].filter(Boolean).join(" ");
    if (words(candidate).length > maximumWords) break;
    selected = candidate;
  }
  if (selected) return /[.!?]$/u.test(selected) ? selected : `${selected}.`;
  const clipped = words(ordered[0] ?? text).slice(0, maximumWords).join(" ").replace(/[,:;\-–—]+$/u, "");
  return /[.!?]$/u.test(clipped) ? clipped : `${clipped}.`;
}

function boundedFact(text: string): string {
  const sentence = firstSentences(text, 26);
  return sentence.length <= 150 ? sentence : `${sentence.slice(0, 146).replace(/\s+\S*$/u, "")}.`;
}

export function createVoiceBrief(scroll: DecisionScroll): VoiceBrief {
  const hasExplicitTension = /differ|disagree|tension|but|however|whereas/iu.test(scroll.rationale);
  const brief = {
    recommendation: firstSentences(scroll.decision, 28),
    why: firstSentences(scroll.rationale, 28),
    keyTension: hasExplicitTension
      ? firstSentences(scroll.rationale, 22, /differ|disagree|tension|but|however|whereas/iu)
      : firstSentences(scroll.examiner, 22),
    immediateNextStep: firstSentences(scroll.quickaction, 22),
    reconveneTrigger: firstSentences(scroll.triggerToReconvene, 18),
  };
  return VoiceBriefSchema.parse(brief);
}

export function createCouncilThinkingContext(scroll: DecisionScroll): string {
  return [
    "Council result (verified):",
    `Decision: ${boundedFact(scroll.decision)}`,
    `Confidence: ${Math.round(scroll.confidence * 100)}%.`,
    `Rationale: ${boundedFact(scroll.rationale)}`,
    `Forethought: ${boundedFact(scroll.forethought)}`,
    `Quickaction: ${boundedFact(scroll.quickaction)}`,
    `Examiner: ${boundedFact(scroll.examiner)}`,
    `Reconvene trigger: ${boundedFact(scroll.triggerToReconvene)}`,
    "The full Decision Scroll is visible in the UI. Answer follow-up questions only from these verified facts; do not invent additional council analysis.",
  ].join("\n");
}

export function createVoiceCommentary(brief: VoiceBrief): string {
  return [
    "The council has completed its deliberation. Give a natural executive briefing of about 20–40 seconds.",
    `Recommendation: ${brief.recommendation}`,
    `Main reason: ${brief.why}`,
    `Key tension: ${brief.keyTension}`,
    `Immediate next step: ${brief.immediateNextStep}`,
    brief.reconveneTrigger ? `Reconvene when: ${brief.reconveneTrigger}` : undefined,
    "Paraphrase conversationally. Do not read the full Decision Scroll or enumerate its fields. The full Scroll is visible on screen.",
  ].filter(Boolean).join("\n");
}

export function voiceBriefWordCount(brief: VoiceBrief): number {
  return words(Object.values(brief).filter(Boolean).join(" ")).length;
}
