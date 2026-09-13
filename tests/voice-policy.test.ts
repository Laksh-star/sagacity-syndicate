import { describe, expect, it } from "vitest";
import { classifyLocalVoiceIntent, interruptionAction, obviousMaterialAssessment, obviousNonMaterialAssessment } from "../shared/voice-policy.js";

describe("voice interruption policy", () => {
  it("does not invalidate a council for a conversational acknowledgement", () => {
    const assessment = obviousNonMaterialAssessment("Okay.", false);
    expect(assessment).toMatchObject({ material: false, confidence: 0.99 });
    expect(interruptionAction(assessment!)).toBe("continue");
  });

  it("keeps post-decision explanation questions in explore mode", () => {
    expect(classifyLocalVoiceIntent("Why?", true)).toBe("follow_up");
    expect(classifyLocalVoiceIntent("What did Forethought think?", true)).toBe("follow_up");
  });

  it("reconvenes for a confident material changed constraint", () => {
    expect(interruptionAction({
      material: true,
      changedConstraint: "The budget is ₹8 lakh instead of ₹20 lakh.",
      reason: "The budget constraint changed.",
      confidence: 0.96,
    })).toBe("reconvene");
  });

  it("deterministically recognizes the post-refresh deadline correction from the live test", () => {
    const assessment = obviousMaterialAssessment("Actually I need to decide within five days, not a few weeks.");
    expect(assessment).toMatchObject({
      material: true,
      changedConstraint: "Actually I need to decide within five days, not a few weeks.",
      confidence: 0.99,
    });
    expect(interruptionAction(assessment!)).toBe("reconvene");
  });

  it("deterministically recognizes other explicit high-impact constraints", () => {
    expect(obviousMaterialAssessment("My budget is actually ₹8 lakh instead of ₹20 lakh.")?.material).toBe(true);
    expect(obviousMaterialAssessment("I forgot to mention I cannot relocate.")?.material).toBe(true);
    expect(obviousMaterialAssessment("Remove option B entirely.")?.material).toBe(true);
  });

  it("preserves work and asks for clarification when materiality is ambiguous", () => {
    expect(interruptionAction({ material: false, reason: "The statement may imply a change.", confidence: 0.4 })).toBe("clarify");
  });
});
