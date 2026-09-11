import OpenAI from "openai";
import type { z } from "zod";
import { jsonSchemaFor } from "../../shared/schemas.js";

export type AgentRun<T> = { sessionId: string; output: T };

export class AgentOutputError extends Error {
  constructor(readonly sessionId: string, message: string, readonly outputText: string) {
    super(message);
    this.name = "AgentOutputError";
  }
}

export interface AgentRuntime {
  start<T>(args: {
    model: string;
    instructions: string;
    input: string;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<AgentRun<T>>;
  continue<T>(args: {
    sessionId: string;
    input: string;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<AgentRun<T>>;
  cancel(sessionId: string): Promise<void>;
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

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async start<T>({ model, instructions, input, schema, signal }: { model: string; instructions: string; input: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<AgentRun<T>> {
    const events = await this.client.beta.agents.sessions.create({
      agent: {
        model,
        instructions,
        text: { verbosity: "low", format: { type: "json_schema", schema: jsonSchemaFor(schema) } },
      },
      environment: { type: "none" },
      input,
      stream: true,
    }, { signal });
    try {
      return await this.consume<T>(events, schema);
    } catch (error) {
      if (!(error instanceof AgentOutputError) || signal?.aborted) throw error;
      return this.continueRaw<T>(error.sessionId, "Repair your previous response. Return only a value matching the configured JSON schema.", schema, signal);
    }
  }

  async continue<T>({ sessionId, input, schema, signal }: { sessionId: string; input: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<AgentRun<T>> {
    try {
      return await this.continueRaw<T>(sessionId, input, schema, signal);
    } catch (error) {
      if (!(error instanceof AgentOutputError) || signal?.aborted) throw error;
      return this.continueRaw<T>(sessionId, "Repair your previous response. Return only a value matching the configured JSON schema.", schema, signal);
    }
  }

  private async continueRaw<T>(sessionId: string, input: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<AgentRun<T>> {
    const events = this.client.beta.agents.sessions.stream(sessionId, { input }, { signal });
    return this.consume(events, schema, sessionId);
  }

  async cancel(sessionId: string): Promise<void> {
    await this.client.beta.agents.sessions.events.create(sessionId, {
      events: [{ type: "agent.session.input.cancel" }],
    });
  }

  private async consume<T>(
    events: AsyncIterable<OpenAI.Beta.Agents.AgentSessionEvent>,
    schema: z.ZodType<T>,
    knownSessionId?: string,
  ): Promise<AgentRun<T>> {
    let sessionId = knownSessionId;
    let text = "";
    for await (const event of events) {
      if (event.type === "agent.session.created") sessionId = event.session.id;
      if (event.type === "agent.session.turn.output_text.done") text = event.text;
      if (event.type === "agent.session.failed") throw new Error(event.session.error ?? "Agent session failed.");
      if (event.type === "agent.session.turn.failed") throw new Error(event.turn.error?.message ?? "Agent turn failed.");
    }
    if (!sessionId) throw new Error("Agent session did not return an ID.");
    if (!text) throw new Error("Agent session returned no final text.");
    try {
      return { sessionId, output: parseJson(text, schema) };
    } catch (error) {
      throw new AgentOutputError(sessionId, error instanceof Error ? error.message : "Invalid agent output.", text);
    }
  }
}
