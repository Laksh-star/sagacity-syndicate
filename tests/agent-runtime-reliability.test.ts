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

  it("surfaces the terminal provider status when stream recovery cannot complete", async () => {
    const broken = async function* () {
      yield { type: "agent.session.created", session: { id: "session_uncertain" } };
      throw new Error("connection reset");
    };
    const retrieve = vi.fn()
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "failed", error: "internal failure" })
      .mockResolvedValueOnce({ status: "failed", error: "internal failure" });
    const turns = { list: vi.fn(async () => ({ data: [] })) };
    const items = { list: vi.fn(async () => ({ data: [] })) };
    const client = { beta: { agents: { sessions: { create: async () => broken(), retrieve, turns, items } } } } as unknown as OpenAI;
    const runtime = new OpenAIAgentRuntime("test", client);

    const error = await runtime.start({
      model: "model", instructions: "Return JSON.", input: "question", schema: OutputSchema,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentSessionStreamError);
    expect(error).toMatchObject({ sessionId: "session_uncertain", providerStatus: "failed" });
    expect(retrieve).toHaveBeenCalledTimes(3);
    expect(retrieve).toHaveBeenCalledWith("session_uncertain", { timeout: 5_000, maxRetries: 0 });
  });

  it("recovers validated output when a broken stream finishes server-side", async () => {
    const broken = async function* () {
      yield { type: "agent.session.created", session: { id: "session_recovered" } };
      throw new Error("stream disconnected");
    };
    const retrieve = vi.fn()
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "idle" });
    const turns = { list: vi.fn(async () => ({ data: [{
      id: "turn_1", status: "completed", usage: {
        input_tokens: 10, input_tokens_details: { cached_tokens: 2 }, output_tokens: 4,
        output_tokens_details: { reasoning_tokens: 1 }, total_tokens: 14,
      },
    }] })) };
    const items = { list: vi.fn(async () => ({ data: [{
      id: "message_1", type: "message", turn_id: "turn_1", role: "assistant", phase: "final_answer", status: "completed",
      content: [{ type: "output_text", text: JSON.stringify({ answer: "recovered" }) }],
    }] })) };
    const client = { beta: { agents: { sessions: { create: async () => broken(), retrieve, turns, items } } } } as unknown as OpenAI;
    const runtime = new OpenAIAgentRuntime("test", client);

    const result = await runtime.start({
      model: "model", instructions: "Return JSON.", input: "question", schema: OutputSchema,
    });

    expect(result.output).toEqual({ answer: "recovered" });
    expect(result.telemetry).toMatchObject({ recovered: true, repaired: false, usage: { totalTokens: 14 } });
    expect(turns.list).toHaveBeenCalledWith("session_recovered", { order: "desc", limit: 1 }, expect.any(Object));
    expect(items.list).toHaveBeenCalledWith("session_recovered", { order: "desc", limit: 100 }, expect.any(Object));
  });
});
