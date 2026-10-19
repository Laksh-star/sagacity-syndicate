import OpenAI from "openai";
import type { z } from "zod";
import { jsonSchemaFor } from "../../shared/schemas.js";
import { AgentOutputError, AgentSessionStreamError, type AgentRuntime, type AgentRun, type AgentSessionStatus, type AgentUsage } from "./runtime.js";
import { recoverBoundedOutput } from "./bounded-output.js";

type Start = Parameters<AgentRuntime["start"]>[0];
type Continue = Parameters<AgentRuntime["continue"]>[0];
type Context = { model: string; instructions: string; metadata?: Record<string, string> };
type Response = OpenAI.Responses.Response;

function usage(response: Response): AgentUsage | undefined {
  const value = response.usage;
  if (!value) return undefined;
  return {
    inputTokens: value.input_tokens, cachedInputTokens: value.input_tokens_details.cached_tokens,
    outputTokens: value.output_tokens, reasoningOutputTokens: value.output_tokens_details.reasoning_tokens,
    totalTokens: value.total_tokens,
  };
}
function addUsage(a?: AgentUsage, b?: AgentUsage): AgentUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  return Object.fromEntries(Object.keys(a).map((key) => [key, a[key as keyof AgentUsage] + b[key as keyof AgentUsage]])) as AgentUsage;
}

/** Application-owned agents backed by Azure Responses, not provider-owned subagents.
 * Background polling deliberately avoids the documented background+streaming issue.
 * Continuations produce a new response ID; original instructions are resent explicitly.
 * Context lives in memory, matching the reference app's restart/rebuild boundary.
 */
export class FoundryAgentRuntime implements AgentRuntime {
  private readonly contexts = new Map<string, Context>();
  constructor(private readonly client: OpenAI, private readonly pollMs = 500, private readonly deadlineMs = 120_000) {}

  async start<T>(args: Start & { schema: z.ZodType<T> }): Promise<AgentRun<T>> {
    return this.run({ model: args.model, instructions: args.instructions, metadata: args.metadata }, args);
  }
  async continue<T>(args: Continue & { schema: z.ZodType<T> }): Promise<AgentRun<T>> {
    const context = this.contexts.get(args.sessionId);
    if (!context) throw new Error("Foundry continuation context is unavailable; rebuild the council after server restart.");
    return this.run(context, args, args.sessionId);
  }
  async cancel(sessionId: string, idempotencyKey?: string): Promise<void> {
    const state = await this.client.responses.retrieve(sessionId, {}, { timeout: 5_000, maxRetries: 0 });
    if (state.status === "completed" || state.status === "cancelled" || state.status === "failed" || state.status === "incomplete") return;
    await this.client.responses.cancel(sessionId, {
      maxRetries: 0, timeout: 5_000,
      ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
    });
  }
  async status(sessionId: string): Promise<AgentSessionStatus> {
    try {
      const response = await this.client.responses.retrieve(sessionId, {}, { timeout: 5_000, maxRetries: 0 });
      if (response.status === "queued" || response.status === "in_progress") return "in_progress";
      return response.status === "completed" ? "idle" : "failed";
    } catch { return "unavailable"; }
  }
  private async run<T>(context: Context, args: { input: string; schema: z.ZodType<T>; signal?: AbortSignal; onSessionId?: (id: string) => void }, previous?: string): Promise<AgentRun<T>> {
    const started = Date.now();
    let response = await this.turn(context, args.input, args.schema, previous, args.signal, args.onSessionId);
    let totalUsage = usage(response);
    let repaired = false;
    let recovered = false;
    const parse = (value: Response): T => {
      try { return args.schema.parse(JSON.parse(value.output_text)); }
      catch (error) { throw new AgentOutputError(value.id, error instanceof Error ? error.message : "Invalid output", value.output_text, usage(value)); }
    };
    let output: T | undefined;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try { output = parse(response); break; }
      catch (error) {
        if (!(error instanceof AgentOutputError) || args.signal?.aborted) throw error;
        if (attempt === 2) {
          const bounded = recoverBoundedOutput(error.outputText, args.schema);
          if (bounded === undefined) throw error;
          output = bounded;
          recovered = true;
          break;
        }
        const repair = attempt === 0
          ? `Repair your previous response. Return only a value matching the configured JSON schema. Fix these validation errors exactly, including string length and array size limits: ${error.message}`
          : `Compress the JSON below to the configured schema without changing the decision, options, conditions or uncertainties. Rewrite concise complete sentences, never substring-cut. Keep strings below 70% of each maxLength; merge overlapping array entries. Return JSON only. Validation errors: ${error.message}\nOriginal complete JSON to compress: ${error.outputText}`;
        response = await this.turn(context, repair, args.schema, attempt === 0 ? response.id : undefined, args.signal, args.onSessionId);
        totalUsage = addUsage(totalUsage, usage(response));
        repaired = true;
      }
    }
    return { sessionId: response.id, output: output as T, telemetry: { durationMs: Date.now() - started, repaired, recovered, usage: totalUsage } };
  }
  private async turn<T>(context: Context, input: string, schema: z.ZodType<T>, previous: string | undefined, signal?: AbortSignal, onSessionId?: (id: string) => void): Promise<Response> {
    signal?.throwIfAborted();
    let response = await this.client.responses.create({
      ...context, input, ...(previous ? { previous_response_id: previous } : {}),
      background: true, store: true, stream: false,
      text: { verbosity: "low", format: { type: "json_schema", name: "sagacity_output", schema: jsonSchemaFor(schema), strict: true } },
    }, { signal, maxRetries: 0 });
    this.contexts.set(response.id, context);
    // Keep only bounded recent continuation context, never raw provider transcripts.
    if (this.contexts.size > 256) this.contexts.delete(this.contexts.keys().next().value as string);
    onSessionId?.(response.id);
    const deadline = Date.now() + this.deadlineMs;
    try {
      while (response.status === "queued" || response.status === "in_progress") {
        signal?.throwIfAborted();
        if (Date.now() >= deadline) throw new Error("Foundry response exceeded the bounded completion window.");
        await new Promise<void>((resolve) => setTimeout(resolve, this.pollMs));
        signal?.throwIfAborted();
        // Retrieval is safe to retry; creation above is never blindly retried.
        response = await this.client.responses.retrieve(response.id, {}, { signal, timeout: 5_000, maxRetries: 2 });
      }
      if (response.status !== "completed") throw new Error(`Foundry response ${response.status}: ${response.error?.message ?? response.incomplete_details?.reason ?? "no completed output"}`);
      return response;
    } catch (error) {
      if (signal?.aborted || Date.now() >= deadline) {
        // Do not use the already-aborted signal for the provider cancellation.
        await this.cancel(response.id).catch(() => undefined);
        if (signal?.aborted) throw signal.reason;
      }
      throw new AgentSessionStreamError(response.id, await this.status(response.id), error);
    }
  }
}
