import { describe, expect, it } from "vitest";
import { MockAgentRuntime } from "../server/agents/mock-runtime.js";
import type { AgentRuntime } from "../server/agents/runtime.js";
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

  it("does not let a provider normalization drop a second material clause", async () => {
    const runtime = {
      async start<T>({ schema }: Parameters<AgentRuntime["start"]>[0]) {
        return {
          sessionId: "partial-materiality",
          output: schema.parse({
            material: true,
            changedConstraint: "Available effort is limited to five hours a week.",
            reason: "The weekly capacity changed.",
            confidence: 0.9,
          }) as T,
        };
      },
      async continue() { throw new Error("Not used."); },
      async cancel() {},
    } as AgentRuntime;
    const guarded = new VoiceMaterialityAssessor(runtime, "test");
    const utterance = "Actually, I can spend only five hours a week and I want the test to be finished in four weeks.";

    await expect(guarded.assess({
      utterance,
      currentContext: "A prior verified channel decision exists.",
      phase: "completed",
    })).resolves.toMatchObject({
      material: true,
      changedConstraint: utterance,
    });
  });
});
