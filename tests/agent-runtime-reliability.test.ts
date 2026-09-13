import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentSessionStreamError, OpenAIAgentRuntime } from "../server/agents/runtime.js";

const OutputSchema = z.object({ answer: z.string() });

function completedEvents() {
  return (async function* () {
    yield { type: "agent.session.created", session: { id: "session_1" } };
    yield { type: "agent.session.turn.output_text.done", text: JSON.stringify({ answer: "yes" }) };
    yield {
      type: "agent.session.turn.completed",
      usage: {
        input_tokens: 12,
        input_tokens_details: { cached_tokens: 3 },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 2 },
        total_tokens: 17,
      },
    };
  })();
}

describe("OpenAIAgentRuntime reliability", () => {
  it("sends provider metadata and records turn usage and latency", async () => {
    const create = vi.fn(async () => completedEvents());
    const client = { beta: { agents: { sessions: { create } } } } as unknown as OpenAI;
    const runtime = new OpenAIAgentRuntime("test", client);

    const result = await runtime.start({
      model: "model",
      instructions: "Return JSON.",
      input: "question",
      schema: OutputSchema,
      metadata: { application: "sagacity-syndicate", stage: "test" },
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { application: "sagacity-syndicate", stage: "test" },
      stream: true,
    }), expect.any(Object));
    expect(result.output).toEqual({ answer: "yes" });
    expect(result.telemetry).toMatchObject({
      repaired: false,
      usage: { inputTokens: 12, cachedInputTokens: 3, outputTokens: 5, reasoningOutputTokens: 2, totalTokens: 17 },
    });
    expect(result.telemetry?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("sends a stable idempotency key with cancellation", async () => {
    const createEvent = vi.fn(async () => undefined);
    const client = { beta: { agents: { sessions: { events: { create: createEvent } } } } } as unknown as OpenAI;
    const runtime = new OpenAIAgentRuntime("test", client);

    await runtime.cancel("session_1", "sagacity-cancel-key");

    expect(createEvent).toHaveBeenCalledWith("session_1", {
      events: [{ type: "agent.session.input.cancel" }],
      "Idempotency-Key": "sagacity-cancel-key",
    });
  });

  it("retrieves provider status after an uncertain stream failure", async () => {
    const broken = async function* () {
      yield { type: "agent.session.created", session: { id: "session_uncertain" } };
      throw new Error("connection reset");
    };
    const retrieve = vi.fn(async () => ({ status: "in_progress" }));
    const client = { beta: { agents: { sessions: { create: async () => broken(), retrieve } } } } as unknown as OpenAI;
    const runtime = new OpenAIAgentRuntime("test", client);

    const error = await runtime.start({
      model: "model", instructions: "Return JSON.", input: "question", schema: OutputSchema,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentSessionStreamError);
    expect(error).toMatchObject({ sessionId: "session_uncertain", providerStatus: "in_progress" });
    expect(retrieve).toHaveBeenCalledWith("session_uncertain", { timeout: 5_000, maxRetries: 0 });
  });
});
