import { describe, expect, it } from "vitest";
import { MockAgentRuntime } from "../server/agents/mock-runtime.js";
import { VoiceReadinessAssessor } from "../server/voice/readiness.js";

describe("VoiceReadinessAssessor", () => {
  const assessor = new VoiceReadinessAssessor(new MockAgentRuntime(), "mock");

  it("convenes a bounded decision without requiring written context", async () => {
    await expect(assessor.assess({
      latestTurn: "Should I move to Bangalore for an AI product job within six weeks?",
      currentContext: "Voice-only intake.",
      completedUserTurns: ["Should I move to Bangalore for an AI product job within six weeks?"],
    })).resolves.toMatchObject({ action: "convene", missingInformation: [] });
  });

  it("asks for the decision when the voice turn is not yet actionable", async () => {
    await expect(assessor.assess({
      latestTurn: "I need some help.",
      currentContext: "Voice-only intake.",
      completedUserTurns: ["I need some help."],
    })).resolves.toMatchObject({ action: "clarify", missingInformation: ["the decision or choice to examine"] });
  });
});
