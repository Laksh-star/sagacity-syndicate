export function isVoiceNonAnswer(text: string): boolean {
  const value = text.toLowerCase().trim().replace(/[.!?,…]+$/gu, '').replace(/\s+/gu, ' ');
  return /^(listening|listening\s*\.\.\.|hmm|hm|uh|um|okay|ok|one moment|wait|hold on|i'?m listening|are you there)$/.test(value);
}
export function isExplicitVoiceGoAhead(text: string): boolean {
  return /\b(convene|send (?:it|this|that) to (?:the )?council|go ahead)\b/iu.test(text);
}
/** An assessment may finish after new speech or a newer completed turn. */
export class VoiceIntakeEpoch {
  private value = 0;
  advance(): number { return ++this.value; }
  current(): number { return this.value; }
  isCurrent(epoch: number): boolean { return this.value === epoch; }
}
export function acceptsCapturedDecision(text: string): boolean {
  return /^(yes|yeah|correct|that is right|that's right|exactly|confirmed|go ahead|convene the council|send it to the council)[.!?]*$/iu.test(text.trim());
}
