import { describe, expect, it } from "vitest";
import { MockAgentRuntime } from "../server/agents/mock-runtime.js";
import { VoiceReadinessAssessor, VoiceReadinessWireSchema } from "../server/voice/readiness.js";
import { jsonSchemaFor } from "../shared/schemas.js";

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

it("never convenes Listening even when prior context is substantial", async () => {
  const assessor = new VoiceReadinessAssessor(new MockAgentRuntime(), "mock");
  await expect(assessor.assess({ latestTurn: "Listening...", currentContext: "Which personal assistant should a company of 20 to 25 people adopt? Sutradhara asks the primary goal.", completedUserTurns: ["Which personal assistant should a company of 20 to 25 people adopt?", "Listening..."] })).resolves.toMatchObject({ action: "clarify", confidence: 1 });
});

it("forwards cancellation and completed runtime usage rather than swallowing an abort", async () => {
  const controller = new AbortController();
  let seenSignal: AbortSignal | undefined;
  const runtime = new MockAgentRuntime();
  runtime.start = async (args: any): Promise<any> => { seenSignal = args.signal; args.signal?.throwIfAborted(); return { sessionId: "r", output: { action: "convene", decisionQuestion: "Which job should I choose?", missingInformation: [], reason: "Ready.", confidence: .9 }, telemetry: { durationMs: 12, repaired: false, usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 30 } } }; };
  const assessor = new VoiceReadinessAssessor(runtime, "mock");
  const request = { latestTurn: "Which job should I choose?", currentContext: "Two job offers.", completedUserTurns: ["Which job should I choose?"] };
  let telemetry: any;
  await assessor.assess(request, controller.signal, value => { telemetry = value; });
  expect(seenSignal).toBe(controller.signal); expect(telemetry.usage.totalTokens).toBe(30);
  controller.abort(new Error("Superseded"));
  await expect(assessor.assess(request, controller.signal)).rejects.toThrow("Superseded");
});

it("uses a provider-compatible schema with every property required", () => {
  const schema = jsonSchemaFor(VoiceReadinessWireSchema) as { properties?: Record<string, unknown>; required?: string[] };
  expect(schema.required?.sort()).toEqual(Object.keys(schema.properties ?? {}).sort());
  expect(VoiceReadinessWireSchema.parse({
    action: "clarify",
    decisionQuestion: null,
    missingInformation: ["the decision to examine"],
    reason: "The decision is not clear yet.",
    confidence: 0.8,
  }).decisionQuestion).toBeNull();
});
