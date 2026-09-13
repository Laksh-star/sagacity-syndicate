import { describe, expect, it } from "vitest";
import { MockAgentRuntime } from "../server/agents/mock-runtime.js";
import { VoiceMaterialityAssessor } from "../server/voice/materiality.js";

describe("VoiceMaterialityAssessor", () => {
  const assessor = new VoiceMaterialityAssessor(new MockAgentRuntime(), "mock");

  it("short-circuits an acknowledgement as non-material", async () => {
    await expect(assessor.assess({
      utterance: "Okay.", currentContext: "Should I move?", phase: "deliberating",
    })).resolves.toMatchObject({ material: false, confidence: 0.99 });
  });

  it("normalizes a changed budget into a material constraint", async () => {
    await expect(assessor.assess({
      utterance: "My budget is actually ₹8 lakh instead of ₹20 lakh.",
      currentContext: "Should I move?", phase: "deliberating",
    })).resolves.toMatchObject({
      material: true,
      changedConstraint: "My budget is actually ₹8 lakh instead of ₹20 lakh.",
    });
  });

  it("treats an explicit shorter decision window as material", async () => {
    await expect(assessor.assess({
      utterance: "Actually I need to decide within five days, not a few weeks.",
      currentContext: "A prior verified decision exists.",
      phase: "completed",
    })).resolves.toMatchObject({
      material: true,
      changedConstraint: "Actually I need to decide within five days, not a few weeks.",
      confidence: 0.99,
    });
  });
});
