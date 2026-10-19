import type {
  ProviderEvent,
  TalkStart,
  VoiceAppendKind,
  VoiceTransport,
  VoiceTransportSink,
} from "./provider-transport.js";
import { waitForIce } from "./webrtc.js";

type AppendAck = { kind: VoiceAppendKind; eventId: string; spokenInstructions?: string };

export class FoundryVoiceTransport implements VoiceTransport {
  readonly kind = "foundry" as const;
  readonly keepEmptyUserTurnOpen = true;
  private relay?: WebSocket;
  private channel?: RTCDataChannel;
  private ready = false;
  private sessionId?: string;
  private readonly appendAcks = new Map<string, AppendAck>();
  private readonly seenEvents = new Set<string>();
  private readonly transcribedItems = new Set<string>();
  private readonly cancelledResponses = new Set<string>();
  private activeResponseId?: string;
  private responseActive = false;
  private readonly spokenQueue: string[] = [];
  private assistantStart = 0;
  private originalConfirmationTranscript?: string;
  private originalConfirmationTranscriptEmitted = false;

  constructor(private readonly sink: VoiceTransportSink) {}

  async connect(peer: RTCPeerConnection): Promise<void> {
    this.channel = peer.createDataChannel("voice-live-events");
    this.channel.addEventListener("message", (message) => this.handleEvent(JSON.parse(message.data) as ProviderEvent));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIce(peer);

    this.relay = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/live/foundry`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Voice negotiation timed out.")), 30_000);
      this.relay?.addEventListener("message", (message) => {
        const event = JSON.parse(message.data) as ProviderEvent;
        if (event.type === "relay.ready") {
          this.relay?.send(JSON.stringify({ type: "rtc.call.sdp.create", sdp_offer: peer.localDescription?.sdp }));
        } else if (event.type === "rtc.call.sdp.created" && event.sdp_answer) {
          void peer.setRemoteDescription({ type: "answer", sdp: event.sdp_answer }).then(() => {
            clearTimeout(timeout);
            this.ready = true;
            this.sink({ type: "ready", sessionId: this.sessionId });
            resolve();
          }).catch(reject);
        } else {
          this.handleEvent(event);
        }
      });
      this.relay?.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Voice connection failed."));
      });
      this.relay?.addEventListener("close", () => {
        this.ready = false;
        this.sink({ type: "closed" });
      });
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  beginTalking(): TalkStart {
    this.spokenQueue.length = 0;
    if (this.activeResponseId) this.cancelledResponses.add(this.activeResponseId);
    return { completeCurrentUserTurn: false, startedAt: performance.now() };
  }

  activateTalking(): void {
    if (this.ready) this.send({ type: "response.cancel", event_id: crypto.randomUUID() });
  }

  endTalking(): void {
    if (this.ready) this.send({ type: "input_audio_buffer.commit", event_id: crypto.randomUUID() });
  }

  append(kind: VoiceAppendKind, content: string, _delegationId: string | null): string {
    const eventId = crypto.randomUUID();
    const itemId = `item_${crypto.randomUUID().replaceAll("-", "").slice(0, 27)}`;
    const shouldSpeak = kind === "commentary" || (kind === "instructions" && /Ask one brief question/.test(content));
    this.appendAcks.set(itemId, {
      kind,
      eventId,
      ...(shouldSpeak ? { spokenInstructions: content.slice(0, 1_200) } : {}),
    });
    this.send({
      type: "conversation.item.create",
      event_id: eventId,
      item: {
        id: itemId,
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: content.slice(0, kind === "thinking" ? 1_600 : 1_200) }],
      },
    });
    return eventId;
  }

  close(): void {
    this.relay?.close();
    this.relay = undefined;
    this.channel?.close();
    this.channel = undefined;
    this.ready = false;
  }

  handleEvent(event: ProviderEvent): void {
    if (event.event_id) {
      if (this.seenEvents.has(event.event_id)) return;
      this.seenEvents.add(event.event_id);
    }
    if (event.response_id && this.cancelledResponses.has(event.response_id) && event.type !== "response.done") return;

    if (event.type === "session.created") {
      this.sessionId = event.session?.id;
      this.sink({ type: "session-id", sessionId: this.sessionId });
    } else if (event.type === "conversation.item.created" && event.item?.id) {
      const ack = this.appendAcks.get(event.item.id);
      if (ack) {
        if (ack.spokenInstructions) this.queueSpeech(ack.spokenInstructions);
        this.appendAcks.delete(event.item.id);
        this.sink({ type: "append-acknowledged", kind: ack.kind, clientEventId: ack.eventId });
      }
    } else if (event.type === "conversation.item.input_audio_transcription.completed" && event.item_id && !this.transcribedItems.has(event.item_id)) {
      this.transcribedItems.add(event.item_id);
      this.sink({
        type: "user-transcript-final",
        itemId: event.item_id,
        text: event.transcript ?? "",
        atMs: performance.now(),
      });
    } else if (event.type === "response.created") {
      this.responseActive = true;
      this.activeResponseId = event.response?.id ?? event.response_id;
      this.assistantStart = performance.now();
      this.sink({ type: "response-created", responseId: this.activeResponseId });
    } else if (event.type === "output_audio_buffer.started") {
      this.sink({ type: "audio-started", responseId: event.response_id ?? this.activeResponseId });
      if (this.originalConfirmationTranscript && !this.originalConfirmationTranscriptEmitted) {
        this.originalConfirmationTranscriptEmitted = true;
        this.sink({
          type: "assistant-transcript-delta",
          text: this.originalConfirmationTranscript,
          startMs: this.assistantStart,
          endMs: performance.now(),
        });
      }
    } else if (event.type === "response.audio_transcript.delta") {
      if (!this.originalConfirmationTranscript) {
        this.sink({
          type: "assistant-transcript-delta",
          text: event.delta ?? "",
          startMs: this.assistantStart,
          endMs: performance.now(),
        });
      }
    } else if (event.type === "response.done") {
      if (event.response?.id && this.activeResponseId && event.response.id !== this.activeResponseId) return;
      this.responseActive = false;
      this.activeResponseId = undefined;
      const exactTranscript = this.originalConfirmationTranscript && !this.originalConfirmationTranscriptEmitted && event.response?.status !== "cancelled"
        ? this.originalConfirmationTranscript
        : undefined;
      this.originalConfirmationTranscript = undefined;
      this.originalConfirmationTranscriptEmitted = false;
      this.sink({ type: "assistant-completed", exactTranscript });
      const next = this.spokenQueue.shift();
      if (next) this.queueSpeech(next);
    } else if (event.type === "error") {
      this.sink({
        type: "error",
        message: event.error?.message ?? "The voice provider reported an error.",
        clientEventId: event.error?.client_event_id,
      });
    }
  }

  private queueSpeech(instructions: string): void {
    if (this.responseActive) {
      this.spokenQueue.push(instructions);
      return;
    }
    this.responseActive = true;
    this.originalConfirmationTranscript = instructions.startsWith("CAPTURED_DECISION_CONFIRMATION:")
      ? `I captured the decision as: ${instructions.slice("CAPTURED_DECISION_CONFIRMATION:".length).trim()} Is that the decision you want the council to answer?`
      : undefined;
    this.originalConfirmationTranscriptEmitted = false;
    this.send({ type: "response.create", response: { instructions } });
  }

  private send(event: object): void {
    if (!this.ready || this.relay?.readyState !== WebSocket.OPEN) throw new Error("Voice session is not ready.");
    this.relay.send(JSON.stringify(event));
  }
}
