import { describe, expect, it } from "vitest";
import { DecisionScrollSchema } from "../shared/schemas.js";
import { createCouncilStartedCommentary, createCouncilThinkingContext, createVoiceBrief, createVoiceCommentary, voiceBriefWordCount } from "../shared/voice.js";

describe("Decision Scroll voice delivery", () => {
  it("speaks the acknowledgement only after delegation is authoritatively active", () => {
    expect(createCouncilStartedCommentary(false)).toContain("actually started");
    expect(createCouncilStartedCommentary(false)).toContain("I’ll put that to the council");
    expect(createCouncilStartedCommentary(true)).toContain("reconvening");
    expect(createCouncilStartedCommentary(true)).toContain("Do not state or imply any findings yet");
  });

  it("keeps the full Scroll authoritative while producing a bounded spoken brief and quiet context", () => {
    const scroll = DecisionScrollSchema.parse({
      decision: "Delay permanent relocation until you have verified hiring traction. Start a remote search now and use a short visit only for confirmed interviews.",
      rationale: "The council agrees that permanent relocation is premature because finances and employer demand remain unverified. Forethought and Quickaction differ on whether a signed offer is mandatory, but both prefer a reversible search first.",
      forethought: "Protect a fallback reserve against delayed joining dates and a failed move.",
      quickaction: "Apply to fifteen relevant roles and request five referrals over the next two weeks.",
      examiner: "The hidden assumption is that physical presence materially improves hiring access.",
      triggerToReconvene: "Reconvene after verified employer feedback or a written offer changes the evidence.", confidence: 0.72,
    });
    const brief = createVoiceBrief(scroll);
    const commentary = createVoiceCommentary(brief);
    const thinking = createCouncilThinkingContext(scroll);

    expect(voiceBriefWordCount(brief)).toBeLessThanOrEqual(120);
    expect(commentary).toContain("Paraphrase conversationally");
    expect(commentary).not.toContain(scroll.forethought);
    expect(thinking).toContain("Forethought:");
    expect(thinking).toContain("The full Decision Scroll is visible");
    expect(scroll.rationale.length).toBeGreaterThan(brief.why.length);
  });
});
