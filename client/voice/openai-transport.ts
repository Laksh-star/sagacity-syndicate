import type {
  ProviderEvent,
  TalkStart,
  VoiceAppendKind,
  VoiceTransport,
  VoiceTransportSink,
} from "./provider-transport.js";
import { waitForIce } from "./webrtc.js";

export class OpenAIVoiceTransport implements VoiceTransport {
  readonly kind = "openai" as const;
  readonly keepEmptyUserTurnOpen = false;
  private channel?: RTCDataChannel;
  private ready = false;
  private readonly muteTurns = new Map<string, string>();

  constructor(private readonly sink: VoiceTransportSink) {}

  async connect(peer: RTCPeerConnection): Promise<void> {
    this.channel = peer.createDataChannel("oai-events");
    this.channel.addEventListener("message", (message) => this.handleEvent(JSON.parse(message.data) as ProviderEvent));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIce(peer);
    const response = await fetch("/api/live/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: peer.localDescription?.sdp }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not start the voice session.");
    const result = await response.json() as { transport: { sdp: string } };
    await peer.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
  }

  isReady(): boolean {
    return this.ready;
  }

  beginTalking(): TalkStart {
    return { completeCurrentUserTurn: true };
  }

  activateTalking(): void {
    if (this.ready) this.send({ type: "session.input_audio.unmute", event_id: crypto.randomUUID() });
  }

  endTalking(activeTurnId?: string): void {
    if (!this.ready) return;
    const eventId = crypto.randomUUID();
    if (activeTurnId) this.muteTurns.set(eventId, activeTurnId);
    this.send({ type: "session.input_audio.mute", event_id: eventId });
  }

  append(kind: VoiceAppendKind, content: string, delegationId: string | null): string {
    const eventId = crypto.randomUUID();
    const limit = kind === "thinking" ? 1_600 : 1_200;
    this.send({
      type: `session.${kind}.append`,
      event_id: eventId,
      delegation_id: delegationId,
      content: content.slice(0, limit),
    });
    return eventId;
  }

  close(): void {
    this.channel?.close();
    this.channel = undefined;
    this.ready = false;
  }

  handleEvent(event: ProviderEvent): void {
    if (event.type === "session.started") {
      this.ready = true;
      this.send({ type: "session.input_audio.mute", event_id: crypto.randomUUID() });
      this.sink({ type: "ready", sessionId: event.session?.id });
    } else if (event.type === "session.input_transcript.delta") {
      this.sink({
        type: "user-transcript-delta",
        text: event.delta ?? "",
        startMs: event.start_ms ?? 0,
        endMs: event.end_ms ?? 0,
      });
    } else if (event.type === "session.output_transcript.delta") {
      this.sink({
        type: "assistant-transcript-delta",
        text: event.delta ?? "",
        startMs: event.start_ms ?? 0,
        endMs: event.end_ms ?? 0,
      });
    } else if (event.type === "session.delegation.created" && event.delegation?.target === "client") {
      this.sink({ type: "delegation", id: event.delegation.id, offsetMs: event.offset_ms ?? 0 });
    } else if (event.type === "session.input_audio.muted") {
      const eventId = event.client_event_id;
      const turnId = eventId ? this.muteTurns.get(eventId) : undefined;
      if (eventId) this.muteTurns.delete(eventId);
      this.sink({ type: "input-muted", turnId });
    } else if (event.type === "session.thinking.appended" || event.type === "session.commentary.appended" || event.type === "session.instructions.appended") {
      this.sink({
        type: "append-acknowledged",
        kind: event.type === "session.thinking.appended" ? "thinking" : event.type === "session.commentary.appended" ? "commentary" : "instructions",
        clientEventId: event.client_event_id,
      });
    } else if (event.type === "error") {
      this.sink({
        type: "error",
        message: event.error?.message ?? "The voice provider reported an error.",
        clientEventId: event.client_event_id ?? event.error?.client_event_id,
      });
    } else if (event.type === "session.closed") {
      this.ready = false;
      this.sink({ type: "closed" });
    }
  }

  private send(event: object): void {
    if (!this.ready || this.channel?.readyState !== "open") throw new Error("Voice session is not ready.");
    this.channel.send(JSON.stringify(event));
  }
}
