import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../config.js";
import { JsonlLogger } from "../logging/jsonl.js";
import { spokenConfirmationQuestion } from "./spoken-confirmation.js";
import { loadPrompt } from "../prompts.js";
import { isAllowedBrowserOrigin } from "../origin-policy.js";

/** Keeps permanent credentials on the server. The browser receives only events/SDP.
 * One upstream control connection per browser. Disconnect closes billable session.
 */
export function attachFoundryVoice(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/api/live/foundry") { socket.destroy(); return; }
    if (process.env.REQUIRE_OWNER_AUTH === "true" && request.headers["x-ms-client-principal-id"] !== process.env.OWNER_PRINCIPAL_ID) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return;
    }
    const origin = request.headers.origin;
    if (!isAllowedBrowserOrigin(origin, config.allowedOrigins) || !config.foundryVoiceEndpoint || !config.foundryApiKey) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return;
    }
    wss.handleUpgrade(request, socket, head, (downstream) => { void connect(downstream).catch(() => downstream.close(1011, "Voice relay initialization failed")); });
  });
}
export function moderatedFoundryResponse(instructions: string, response: Record<string, unknown>): Record<string, unknown> {
  const task = typeof response.instructions === "string" ? response.instructions : "Wait for application guidance.";
  if (task.startsWith("CAPTURED_DECISION_CONFIRMATION:")) {
    const question = task.slice("CAPTURED_DECISION_CONFIRMATION:".length).trim();
    const { instructions: _task, ...options } = response;
    return { ...options, pre_generated_assistant_message: { type: "message", role: "assistant", content: [{ type: "text", text: `I captured the decision as: ${spokenConfirmationQuestion(question)} Is that the decision you want the council to answer?` }] } };
  }
  return { ...response, instructions: `${instructions}\n\nApplication-directed spoken task: ${typeof response.instructions === "string" ? response.instructions : "Wait for application guidance."}` };
}

async function connect(downstream: WebSocket): Promise<void> {
  const instructions = await loadPrompt("sutradhara");
  const url = new URL(config.foundryVoiceEndpoint as string);
  url.protocol = "wss:";
  url.pathname = "/voice-live/realtime/calls";
  url.search = "";
  url.searchParams.set("api-version", "2026-01-01-preview");
  url.searchParams.set("model", config.foundryVoiceModel);
  const upstream = new WebSocket(url, { headers: { "api-key": config.foundryApiKey as string }, maxPayload: 1024 * 1024 });
  const timeout = setTimeout(() => { downstream.close(1011, "Voice connection timeout"); upstream.close(); }, 30_000);
  let offered = false;
  upstream.on("open", () => { clearTimeout(timeout); downstream.send(JSON.stringify({ type: "relay.ready" })); });
  upstream.on("message", (data) => { if (downstream.readyState === WebSocket.OPEN) downstream.send(data.toString()); });
  upstream.on("error", () => { if (downstream.readyState === WebSocket.OPEN) downstream.send(JSON.stringify({ type: "error", error: { message: "Voice Live upstream connection failed." } })); downstream.close(); });
  upstream.on("close", () => downstream.close());
  downstream.on("close", () => { clearTimeout(timeout); upstream.close(); });
  downstream.on("error", () => upstream.close());
  downstream.on("message", (data) => {
    if (upstream.readyState !== WebSocket.OPEN) return;
    try {
      const event = JSON.parse(data.toString()) as { type: string; sdp_offer?: string };
      if (event.type === "rtc.call.sdp.create") {
        if (offered || typeof event.sdp_offer !== "string") return;
        offered = true;
        upstream.send(JSON.stringify({ ...event, session: {
          modalities: ["text", "audio"], instructions,
          voice: { type: "azure-standard", name: "en-US-Ava:DragonHDLatestNeural" },
          input_audio_transcription: { model: "azure-speech" },
          turn_detection: { type: "server_vad", create_response: false, interrupt_response: true },
        } }));
      } else if (["response.create", "response.cancel", "conversation.item.create", "conversation.item.truncate", "input_audio_buffer.clear"].includes(event.type)) {
        // Responses-level instructions replace session instructions on this service.
        // Always retain the moderator contract when the app supplies a spoken directive.
        if (event.type === "response.create") {
          const response = (event as unknown as { response?: Record<string, unknown> }).response ?? {};
          if (typeof response.instructions === "string" && response.instructions.startsWith("CAPTURED_DECISION_CONFIRMATION:")) {
          const original = response.instructions.slice("CAPTURED_DECISION_CONFIRMATION:".length).trim();
          void new JsonlLogger().write({ deliberationId: "voice-confirmation", conversationRevision: 0, deliberationRevision: 0, event: "voice.confirmation.spoken_forms", data: { original, spoken: spokenConfirmationQuestion(original) } }).catch(() => undefined);
        }
        upstream.send(JSON.stringify({ ...event, response: moderatedFoundryResponse(instructions, response) }));
        } else upstream.send(JSON.stringify(event));
      }
    } catch { downstream.send(JSON.stringify({ type: "error", error: { message: "Invalid voice control event." } })); }
  });
}
