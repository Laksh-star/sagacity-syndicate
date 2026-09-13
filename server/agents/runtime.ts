import OpenAI from "openai";
import type { z } from "zod";
import { jsonSchemaFor } from "../../shared/schemas.js";

export type AgentUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type AgentRunTelemetry = {
  durationMs: number;
  repaired: boolean;
  usage?: AgentUsage;
};

export type AgentRun<T> = { sessionId: string; output: T; telemetry?: AgentRunTelemetry };
export type AgentSessionStatus = "idle" | "in_progress" | "requires_action" | "failed" | "unavailable";

type StartArgs<T> = {
  model: string;
  instructions: string;
  input: string;
  schema: z.ZodType<T>;
  metadata?: Record<string, string>;
  onSessionId?: (sessionId: string) => void;
  signal?: AbortSignal;
};

type ContinueArgs<T> = {
  sessionId: string;
  input: string;
  schema: z.ZodType<T>;
  onSessionId?: (sessionId: string) => void;
  signal?: AbortSignal;
};

export class AgentOutputError extends Error {
  constructor(
    readonly sessionId: string,
    message: string,
    readonly outputText: string,
    readonly usage?: AgentUsage,
  ) {
    super(message);
    this.name = "AgentOutputError";
  }
}

export class AgentSessionStreamError extends Error {
  constructor(readonly sessionId: string, readonly providerStatus: AgentSessionStatus, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : "The event stream ended unexpectedly.";
    super(`Agent session stream failed; provider status is ${providerStatus}. ${detail}`);
    this.name = "AgentSessionStreamError";
  }
}

class AgentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentProviderError";
  }
}

export interface AgentRuntime {
  start<T>(args: StartArgs<T>): Promise<AgentRun<T>>;
  continue<T>(args: ContinueArgs<T>): Promise<AgentRun<T>>;
  cancel(sessionId: string, idempotencyKey?: string): Promise<void>;
  status?(sessionId: string): Promise<AgentSessionStatus>;
}

function usageFrom(value: OpenAI.Beta.Agents.TokenUsage | null | undefined): AgentUsage | undefined {
  if (!value) return undefined;
  return {
    inputTokens: value.input_tokens,
    cachedInputTokens: value.input_tokens_details.cached_tokens,
    outputTokens: value.output_tokens,
    reasoningOutputTokens: value.output_tokens_details.reasoning_tokens,
    totalTokens: value.total_tokens,
  };
}

function sumUsage(left?: AgentUsage, right?: AgentUsage): AgentUsage | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens: left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Agent returned no JSON object.");
    value = JSON.parse(match[0]);
  }
  return schema.parse(value);
}

export class OpenAIAgentRuntime implements AgentRuntime {
  private readonly client: OpenAI;

  constructor(apiKey: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  async start<T>({ model, instructions, input, schema, metadata, onSessionId, signal }: StartArgs<T>): Promise<AgentRun<T>> {
    const startedAt = Date.now();
    const events = await this.client.beta.agents.sessions.create({
      agent: {
        model,
        instructions,
        text: { verbosity: "low", format: { type: "json_schema", schema: jsonSchemaFor(schema) } },
      },
      environment: { type: "none" },
      input,
      metadata,
      stream: true,
    }, { signal });
    try {
      return await this.consume<T>(events, schema, { startedAt, onSessionId, signal });
    } catch (error) {
      if (!(error instanceof AgentOutputError) || signal?.aborted) throw error;
      const repaired = await this.continueRaw<T>(error.sessionId, "Repair your previous response. Return only a value matching the configured JSON schema.", schema, { signal, onSessionId, startedAt });
      return {
        ...repaired,
        telemetry: {
          durationMs: Date.now() - startedAt,
          repaired: true,
          usage: sumUsage(error.usage, repaired.telemetry?.usage),
        },
      };
    }
  }

  async continue<T>({ sessionId, input, schema, onSessionId, signal }: ContinueArgs<T>): Promise<AgentRun<T>> {
    const startedAt = Date.now();
    try {
      return await this.continueRaw<T>(sessionId, input, schema, { signal, onSessionId, startedAt });
    } catch (error) {
      if (!(error instanceof AgentOutputError) || signal?.aborted) throw error;
      const repaired = await this.continueRaw<T>(sessionId, "Repair your previous response. Return only a value matching the configured JSON schema.", schema, { signal, onSessionId, startedAt });
      return {
        ...repaired,
        telemetry: {
          durationMs: Date.now() - startedAt,
          repaired: true,
          usage: sumUsage(error.usage, repaired.telemetry?.usage),
        },
      };
    }
  }

  private async continueRaw<T>(
    sessionId: string,
    input: string,
    schema: z.ZodType<T>,
    options: { signal?: AbortSignal; onSessionId?: (sessionId: string) => void; startedAt?: number },
  ): Promise<AgentRun<T>> {
    options.onSessionId?.(sessionId);
    const events = this.client.beta.agents.sessions.stream(sessionId, { input }, { signal: options.signal });
    return this.consume(events, schema, { knownSessionId: sessionId, ...options, startedAt: options.startedAt ?? Date.now() });
  }

  async cancel(sessionId: string, idempotencyKey?: string): Promise<void> {
    await this.client.beta.agents.sessions.events.create(sessionId, {
      events: [{ type: "agent.session.input.cancel" }],
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    });
  }

  async status(sessionId: string): Promise<AgentSessionStatus> {
    try {
      return (await this.client.beta.agents.sessions.retrieve(sessionId, { timeout: 5_000, maxRetries: 0 })).status;
    } catch {
      return "unavailable";
    }
  }

  private async consume<T>(
    events: AsyncIterable<OpenAI.Beta.Agents.AgentSessionEvent>,
    schema: z.ZodType<T>,
    options: { knownSessionId?: string; startedAt: number; onSessionId?: (sessionId: string) => void; signal?: AbortSignal },
  ): Promise<AgentRun<T>> {
    let sessionId = options.knownSessionId;
    let text = "";
    let usage: AgentUsage | undefined;
    try {
      for await (const event of events) {
        if (event.type === "agent.session.created") {
          sessionId = event.session.id;
          options.onSessionId?.(sessionId);
        }
        if (event.type === "agent.session.turn.output_text.done") text = event.text;
        if (event.type === "agent.session.turn.completed") usage = usageFrom(event.usage);
        if (event.type === "agent.session.failed") throw new AgentProviderError(event.session.error ?? "Agent session failed.");
        if (event.type === "agent.session.turn.failed") throw new AgentProviderError(event.turn.error?.message ?? "Agent turn failed.");
      }
    } catch (error) {
      if (!sessionId || options.signal?.aborted || error instanceof AgentOutputError || error instanceof AgentProviderError) throw error;
      const providerStatus = await this.status(sessionId);
      throw new AgentSessionStreamError(sessionId, providerStatus, error);
    }
    if (!sessionId) throw new Error("Agent session did not return an ID.");
    if (!text) throw new Error("Agent session returned no final text.");
    try {
      return {
        sessionId,
        output: parseJson(text, schema),
        telemetry: { durationMs: Date.now() - options.startedAt, repaired: false, usage },
      };
    } catch (error) {
      throw new AgentOutputError(sessionId, error instanceof Error ? error.message : "Invalid agent output.", text, usage);
    }
  }
}
