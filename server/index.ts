import express from "express";
import OpenAI from "openai";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DeliberationRequestSchema, LiveDiagnosticEventSchema, VoiceInterruptionRequestSchema, VoiceReadinessRequestSchema, type CouncilEvent } from "../shared/schemas.js";
import { MockAgentRuntime } from "./agents/mock-runtime.js";
import { OpenAIAgentRuntime } from "./agents/runtime.js";
import { config } from "./config.js";
import { createLiveSession } from "./live/session.js";
import { CouncilOrchestrator } from "./orchestration/council.js";
import { VoiceMaterialityAssessor } from "./voice/materiality.js";
import { VoiceReadinessAssessor } from "./voice/readiness.js";
import { LiveJsonlLogger } from "./logging/live-jsonl.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

const runtime = config.mockCouncil
  ? new MockAgentRuntime()
  : new OpenAIAgentRuntime(config.apiKey as string);
const council = new CouncilOrchestrator(runtime, {
  council: config.councilModel,
  synthesis: config.synthesisModel,
});
const voiceMateriality = new VoiceMaterialityAssessor(runtime, config.councilModel);
const voiceReadiness = new VoiceReadinessAssessor(runtime, config.councilModel);
const liveLogger = new LiveJsonlLogger();

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, mode: config.mockCouncil ? "mock" : "live", liveEnabled: Boolean(config.apiKey) });
});

app.post("/api/live/session", async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):(5173|8787)$/.test(origin)) {
    response.status(403).json({ error: "Unexpected request origin." });
    return;
  }
  if (typeof request.body?.sdp !== "string" || !request.body.sdp.trim()) {
    response.status(400).json({ error: "An SDP offer is required." });
    return;
  }
  try {
    response.status(201).json(await createLiveSession(request.body.sdp));
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      response.status(error.status ?? 502).json({ error: "GPT-Live session creation failed." });
      return;
    }
    response.status(503).json({ error: error instanceof Error ? error.message : "GPT-Live is unavailable." });
  }
});

app.post("/api/voice/interruption-assessment", async (request, response) => {
  const parsed = VoiceInterruptionRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid voice interruption request.", issues: parsed.error.issues });
    return;
  }
  response.json(await voiceMateriality.assess(parsed.data));
});

app.post("/api/voice/readiness-assessment", async (request, response) => {
  const parsed = VoiceReadinessRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid voice readiness request.", issues: parsed.error.issues });
    return;
  }
  response.json(await voiceReadiness.assess(parsed.data));
});

app.post("/api/live/events", async (request, response) => {
  const parsed = LiveDiagnosticEventSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid Live diagnostic event." });
    return;
  }
  await liveLogger.write(parsed.data);
  response.status(202).end();
});

app.post("/api/deliberations", async (request, response) => {
  const parsed = DeliberationRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid deliberation request.", issues: parsed.error.issues });
    return;
  }
  response.status(200);
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.flushHeaders();
  const send = (event: CouncilEvent) => response.write(`${JSON.stringify(event)}\n`);
  try {
    const result = await council.deliberate(parsed.data, send);
    response.write(`${JSON.stringify({ type: "stream.done", deliberationId: result.deliberationId })}\n`);
  } catch {
    // A typed error or interruption event has already been emitted.
  } finally {
    response.end();
  }
});

app.post("/api/deliberations/:id/interrupt", async (request, response) => {
  const nextConversationRevision = Number(request.body?.nextConversationRevision);
  if (!Number.isInteger(nextConversationRevision) || nextConversationRevision < 0) {
    response.status(400).json({ error: "A non-negative nextConversationRevision is required." });
    return;
  }
  const interrupted = await council.interrupt(
    request.params.id,
    nextConversationRevision,
    typeof request.body?.reason === "string" ? request.body.reason.slice(0, 500) : "User changed the conversation context.",
  );
  response.status(interrupted ? 202 : 404).json({ interrupted });
});

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve(root, "dist/client")));
  app.get("/{*path}", (_request, response) => response.sendFile(resolve(root, "dist/client/index.html")));
}

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Sagacity Syndicate server: http://127.0.0.1:${config.port} (${config.mockCouncil ? "mock" : "live"} council)`);
});
