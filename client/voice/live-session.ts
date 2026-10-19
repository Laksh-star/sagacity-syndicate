import { LivePlaybackController, type LivePlaybackState, type LivePlaybackTransition } from "./playback-controller.js";
import type {
  VoiceAppendKind,
  VoiceProvider,
  VoiceTransport,
  VoiceTransportEvent,
  VoiceTransportFactory,
} from "./provider-transport.js";
import { createVoiceTransport } from "./transport-factory.js";
import { VoiceTurnTracker, type DelegationBinding, type VoiceTurn } from "./turn-tracker.js";

export type { VoiceTurn } from "./turn-tracker.js";

export type LiveDelegation = DelegationBinding & { causalTurn?: VoiceTurn };

const USER_TRANSCRIPT_SETTLE_MS = 1_000;

export class LiveVoiceSession extends EventTarget {
  private transport?: VoiceTransport;
  private stream?: MediaStream;
  private output?: HTMLAudioElement;
  private playback?: LivePlaybackController;
  private peer?: RTCPeerConnection;
  private ready = false;
  private sessionId?: string;
  private holding = false;
  private readonly turns = new VoiceTurnTracker();
  private readonly pendingDelegations = new Map<string, LiveDelegation[]>();
  private userSettleTimer?: ReturnType<typeof setTimeout>;
  private assistantSettleTimer?: ReturnType<typeof setTimeout>;
  private microphoneContext?: AudioContext;
  private microphoneAnalyser?: AnalyserNode;
  private microphoneProbeTimer?: ReturnType<typeof setInterval>;
  private microphonePeak = 0;

  constructor(private readonly transportFactory: VoiceTransportFactory = createVoiceTransport) {
    super();
  }

  async connect(): Promise<void> {
    if (this.peer) return;
    const health = await fetch("/api/health").then((response) => response.json()) as { voiceProvider?: string };
    const provider: VoiceProvider = health.voiceProvider === "foundry" ? "foundry" : "openai";
    this.transport = this.transportFactory(provider, (event) => this.handleTransportEvent(event));
    this.stream = await this.getMicrophone();
    this.stream.getAudioTracks().forEach((track) => { track.enabled = false; });
    this.peer = new RTCPeerConnection();
    this.output = new Audio();
    this.output.autoplay = true;
    this.output.addEventListener("playing", () => this.timing("live.media.playing", "HTMLMediaElement playing; not a first audible sample guarantee"));
    this.playback = new LivePlaybackController(this.output);
    this.peer.ontrack = (event) => { if (this.output) this.output.srcObject = event.streams[0]; };
    this.stream.getTracks().forEach((track) => this.peer?.addTrack(track, this.stream as MediaStream));
    await this.transport.connect(this.peer);
  }

  setTalking(active: boolean): void {
    this.holding = active;
    if (active) {
      this.stream?.getAudioTracks().forEach((track) => { track.enabled = true; });
      this.startMicrophoneProbe();
      const action = this.transport?.beginTalking() ?? { completeCurrentUserTurn: true };
      this.emitPlayback(this.playback?.interrupt() ?? "none");
      this.clearUserSettle();
      if (action.completeCurrentUserTurn) this.completeUserTurn();
      const turn = this.turns.beginUserTurn(action.startedAt);
      this.emitTurn(turn);
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
        event: "live.user_turn.started", sessionId: this.sessionId, detail: `turn=${turn.id}`,
      } }));
      this.transport?.activateTalking();
    } else if (this.ready) {
      this.stopMicrophoneProbe();
      this.stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
      const activeTurn = [...this.turns.list()].reverse().find((turn) => turn.role === "user" && !turn.complete);
      this.transport?.endTalking(activeTurn?.id);
      this.scheduleUserCompletion(USER_TRANSCRIPT_SETTLE_MS);
    }
    this.dispatchEvent(new CustomEvent("talking", { detail: active }));
  }

  appendThinking(content: string, delegationId: string | null): string {
    return this.append("thinking", content, delegationId);
  }

  appendCommentary(content: string, delegationId: string | null): string {
    return this.append("commentary", content, delegationId);
  }

  appendInstructions(content: string, delegationId: string | null = null): string {
    return this.append("instructions", content, delegationId);
  }

  close(): void {
    this.clearUserSettle();
    if (this.assistantSettleTimer) clearTimeout(this.assistantSettleTimer);
    this.completeUserTurn();
    this.completeAssistantTurn();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.microphoneProbeTimer) clearInterval(this.microphoneProbeTimer);
    this.microphoneProbeTimer = undefined;
    void this.microphoneContext?.close().catch(() => undefined);
    this.microphoneContext = undefined;
    this.microphoneAnalyser = undefined;
    this.transport?.close();
    this.transport = undefined;
    this.peer?.close();
    this.playback?.reset();
    this.playback = undefined;
    this.peer = undefined;
    this.ready = false;
    this.dispatchEvent(new CustomEvent("diagnostic", { detail: { event: "live.session.closed", sessionId: this.sessionId } }));
  }

  private append(kind: VoiceAppendKind, content: string, delegationId: string | null): string {
    if (!this.transport) throw new Error("Voice session is not ready.");
    return this.transport.append(kind, content, delegationId);
  }

  private handleTransportEvent(event: VoiceTransportEvent): void {
    if (event.type === "ready") {
      this.ready = true;
      this.sessionId = event.sessionId ?? this.sessionId;
      this.dispatchEvent(new CustomEvent("ready", { detail: this.sessionId }));
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: { event: "live.session.started", sessionId: this.sessionId } }));
    } else if (event.type === "session-id") {
      this.sessionId = event.sessionId;
    } else if (event.type === "closed") {
      this.ready = false;
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: { event: "live.session.closed", sessionId: this.sessionId } }));
      this.dispatchEvent(new Event("closed"));
    } else if (event.type === "user-transcript-delta") {
      this.acceptTranscriptDelta("user", event.text, event.startMs, event.endMs);
    } else if (event.type === "user-transcript-final") {
      this.timing("live.asr.final", `item=${event.itemId}; characters=${event.text.length}`);
      const previous = this.turns.list().at(-1);
      const separator = previous?.role === "user" && previous.text && !previous.complete ? " " : "";
      this.acceptTranscriptDelta("user", separator + event.text, event.atMs, event.atMs);
      if (!this.holding) this.scheduleUserCompletion(USER_TRANSCRIPT_SETTLE_MS);
    } else if (event.type === "assistant-transcript-delta") {
      this.emitPlayback(this.playback?.acceptAssistantDelta(event.startMs) ?? "none");
      this.acceptTranscriptDelta("sutradhara", event.text, event.startMs, event.endMs);
    } else if (event.type === "assistant-completed") {
      if (event.exactTranscript) {
        const now = performance.now();
        this.acceptTranscriptDelta("sutradhara", event.exactTranscript, now, now);
      }
      this.completeAssistantTurn();
    } else if (event.type === "delegation") {
      const binding = this.turns.bindDelegation(event.id, event.offsetMs);
      const detail = { ...binding, causalTurn: this.turns.turnForDelegation(binding.id) };
      if (detail.causalTurn && !detail.causalTurn.complete) {
        const pending = this.pendingDelegations.get(detail.causalTurn.id) ?? [];
        this.pendingDelegations.set(detail.causalTurn.id, [...pending, detail]);
      } else {
        this.emitDelegation(detail);
      }
    } else if (event.type === "input-muted") {
      const activeTurn = [...this.turns.list()].reverse().find((turn) => turn.role === "user" && !turn.complete);
      if (event.turnId && activeTurn?.id === event.turnId) this.scheduleUserCompletion(USER_TRANSCRIPT_SETTLE_MS);
    } else if (event.type === "append-acknowledged") {
      this.dispatchEvent(new CustomEvent("append.acknowledged", { detail: {
        kind: event.kind,
        clientEventId: event.clientEventId,
      } }));
    } else if (event.type === "error") {
      this.dispatchEvent(new CustomEvent("live.error", { detail: {
        message: event.message,
        clientEventId: event.clientEventId,
      } }));
    } else if (event.type === "response-created") {
      this.timing("live.response.created", `response=${event.responseId ?? "unknown"}`);
    } else if (event.type === "audio-started") {
      // Foundry may intentionally suppress generated transcript deltas when the
      // application owns the exact visible wording (for example, decision
      // confirmation). The provider's current-response audio event is therefore
      // the authoritative playback boundary, while the controller still rejects
      // audio that predates an unfinished or newer user turn.
      this.emitPlayback(this.playback?.acceptAssistantDelta(performance.now()) ?? "none");
      this.timing("live.audio.started", `response=${event.responseId ?? "unknown"}; provider output buffer start`);
    }
  }

  private acceptTranscriptDelta(role: VoiceTurn["role"], text: string, startMs: number, endMs: number): void {
    const mutation = this.turns.acceptDelta({ role, text, startMs, endMs });
    for (const completed of mutation.completed) this.emitCompletedTurn(completed);
    this.emitTurn(mutation.updated);
    if (mutation.updated.role === "user" && this.userSettleTimer) this.scheduleUserCompletion(USER_TRANSCRIPT_SETTLE_MS);
    if (mutation.updated.role === "sutradhara") this.scheduleAssistantCompletion();
  }

  private timing(event: "live.asr.final" | "live.response.created" | "live.audio.started" | "live.media.playing", detail: string): void {
    this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
      event,
      sessionId: this.sessionId,
      detail,
      clientTimestamp: new Date().toISOString(),
      clientMonotonicMs: performance.now(),
    } }));
  }

  private emitTurn(turn: VoiceTurn): void {
    this.dispatchEvent(new CustomEvent("turn", { detail: turn }));
  }

  private emitCompletedTurn(turn: VoiceTurn): void {
    this.emitTurn(turn);
    const pending = this.pendingDelegations.get(turn.id) ?? [];
    this.pendingDelegations.delete(turn.id);
    for (const delegation of pending) this.emitDelegation({ ...delegation, causalTurn: turn });
    this.dispatchEvent(new CustomEvent("turn.completed", { detail: turn }));
    if (turn.role === "user") {
      this.playback?.completeUserTurn(turn.completedAt);
      this.emitPlayback("none");
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
        event: "live.user_turn.completed",
        sessionId: this.sessionId,
        detail: `turn=${turn.id}; characters=${turn.text.length}`,
      } }));
    }
  }

  private emitDelegation(detail: LiveDelegation): void {
    this.dispatchEvent(new CustomEvent("delegation", { detail }));
    this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
      event: "live.delegation.created",
      sessionId: this.sessionId,
      delegationId: detail.id,
      detail: `causalTurn=${detail.causalTurnId ?? "unknown"}`,
    } }));
  }

  private scheduleUserCompletion(delayMs: number): void {
    this.clearUserSettle();
    this.userSettleTimer = setTimeout(() => this.completeUserTurn(), delayMs);
  }

  private clearUserSettle(): void {
    if (this.userSettleTimer) clearTimeout(this.userSettleTimer);
    this.userSettleTimer = undefined;
  }

  private completeUserTurn(): void {
    this.clearUserSettle();
    const active = this.turns.list().filter((turn) => turn.role === "user" && !turn.complete).at(-1);
    if (this.transport?.keepEmptyUserTurnOpen && !active?.text.trim()) return;
    const completed = this.turns.completeUserTurn();
    if (completed) this.emitCompletedTurn(completed);
  }

  private scheduleAssistantCompletion(): void {
    if (this.assistantSettleTimer) clearTimeout(this.assistantSettleTimer);
    this.assistantSettleTimer = setTimeout(() => this.completeAssistantTurn(), 2_000);
  }

  private completeAssistantTurn(): void {
    if (this.assistantSettleTimer) clearTimeout(this.assistantSettleTimer);
    this.assistantSettleTimer = undefined;
    const completed = this.turns.completeAssistantTurn();
    if (completed) {
      this.emitTurn(completed);
      this.dispatchEvent(new CustomEvent("turn.completed", { detail: completed }));
      this.emitPlayback(this.playback?.finishAssistantTurn() ?? "none");
    }
  }

  private emitPlayback(transition: LivePlaybackTransition): void {
    const state: LivePlaybackState = this.playback?.state() ?? "idle";
    this.dispatchEvent(new CustomEvent("playback", { detail: { state, transition } }));
    const event = transition === "started" ? "live.playback.started"
      : transition === "suppressed" ? "live.playback.suppressed"
        : transition === "resumed" ? "live.playback.resumed"
          : transition === "stale_discarded" ? "live.playback.stale_audio.discarded"
            : undefined;
    if (event) this.dispatchEvent(new CustomEvent("diagnostic", { detail: { event, sessionId: this.sessionId } }));
  }

  private async getMicrophone(): Promise<MediaStream> {
    const request = navigator.mediaDevices.getUserMedia({ audio: true });
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            reject(new Error("Microphone permission did not resolve. Check this site's microphone permission and try again."));
          }, 15_000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (timedOut) void request.then((lateStream) => lateStream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
    }
  }

  private startMicrophoneProbe(): void {
    if (!this.stream || typeof AudioContext === "undefined") return;
    try {
      this.microphoneContext ??= new AudioContext();
      if (!this.microphoneAnalyser) {
        this.microphoneAnalyser = this.microphoneContext.createAnalyser();
        this.microphoneAnalyser.fftSize = 512;
        this.microphoneContext.createMediaStreamSource(this.stream).connect(this.microphoneAnalyser);
      }
      void this.microphoneContext.resume();
      this.microphonePeak = 0;
      if (this.microphoneProbeTimer) clearInterval(this.microphoneProbeTimer);
      const samples = new Uint8Array(this.microphoneAnalyser.fftSize);
      this.microphoneProbeTimer = setInterval(() => {
        this.microphoneAnalyser?.getByteTimeDomainData(samples);
        for (const sample of samples) this.microphonePeak = Math.max(this.microphonePeak, Math.abs(sample - 128) / 128);
      }, 50);
    } catch {
      // The probe is diagnostic only and must never block voice capture.
    }
  }

  private stopMicrophoneProbe(): void {
    if (this.microphoneProbeTimer) clearInterval(this.microphoneProbeTimer);
    this.microphoneProbeTimer = undefined;
    const track = this.stream?.getAudioTracks()[0];
    this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
      event: "live.microphone.capture",
      sessionId: this.sessionId,
      detail: `peak=${this.microphonePeak.toFixed(4)}; readyState=${track?.readyState ?? "missing"}; muted=${track?.muted ?? "unknown"}`,
    } }));
  }
}
