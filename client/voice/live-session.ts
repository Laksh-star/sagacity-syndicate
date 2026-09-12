import { VoiceTurnTracker, type DelegationBinding, type VoiceTurn } from "./turn-tracker";

export type { VoiceTurn } from "./turn-tracker";

export type LiveDelegation = DelegationBinding & { causalTurn?: VoiceTurn };

type LiveEvent = {
  type: string;
  delta?: string;
  event_id?: string;
  client_event_id?: string;
  start_ms?: number;
  end_ms?: number;
  offset_ms?: number;
  delegation?: { id: string; target: string };
  session?: { id: string };
  error?: { message?: string; client_event_id?: string };
};

export class LiveVoiceSession extends EventTarget {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private output?: HTMLAudioElement;
  private ready = false;
  private sessionId?: string;
  private readonly turns = new VoiceTurnTracker();
  private readonly pendingDelegations = new Map<string, LiveDelegation[]>();
  private readonly muteTurns = new Map<string, string>();
  private userSettleTimer?: ReturnType<typeof setTimeout>;
  private assistantSettleTimer?: ReturnType<typeof setTimeout>;

  async connect(): Promise<void> {
    if (this.peer) return;
    this.stream = await this.getMicrophone();
    this.stream.getAudioTracks().forEach((track) => { track.enabled = false; });
    this.peer = new RTCPeerConnection();
    this.output = new Audio();
    this.output.autoplay = true;
    this.peer.ontrack = (event) => { if (this.output) this.output.srcObject = event.streams[0]; };
    this.stream.getTracks().forEach((track) => this.peer?.addTrack(track, this.stream as MediaStream));
    this.channel = this.peer.createDataChannel("oai-events");
    this.channel.addEventListener("message", (message) => this.handle(JSON.parse(message.data) as LiveEvent));
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    await this.waitForIce();
    const response = await fetch("/api/live/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: this.peer.localDescription?.sdp }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not start GPT-Live.");
    const result = await response.json() as { transport: { sdp: string } };
    await this.peer.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
  }

  setTalking(active: boolean): void {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = active; });
    if (active) {
      this.clearUserSettle();
      this.completeUserTurn();
      const turn = this.turns.beginUserTurn();
      this.emitTurn(turn);
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
        event: "live.user_turn.started", sessionId: this.sessionId, detail: `turn=${turn.id}`,
      } }));
      if (this.ready) this.send({ type: "session.input_audio.unmute", event_id: crypto.randomUUID() });
    } else if (this.ready) {
      const eventId = crypto.randomUUID();
      const activeTurn = [...this.turns.list()].reverse().find((turn) => turn.role === "user" && !turn.complete);
      if (activeTurn) this.muteTurns.set(eventId, activeTurn.id);
      this.send({ type: "session.input_audio.mute", event_id: eventId });
      this.scheduleUserCompletion(800);
    }
    this.dispatchEvent(new CustomEvent("talking", { detail: active }));
  }

  appendThinking(content: string, delegationId: string): string {
    const eventId = crypto.randomUUID();
    this.send({ type: "session.thinking.append", event_id: eventId, delegation_id: delegationId, content: content.slice(0, 1_600) });
    return eventId;
  }

  appendCommentary(content: string, delegationId: string): string {
    const eventId = crypto.randomUUID();
    this.send({ type: "session.commentary.append", event_id: eventId, delegation_id: delegationId, content: content.slice(0, 1_200) });
    return eventId;
  }

  close(): void {
    this.clearUserSettle();
    if (this.assistantSettleTimer) clearTimeout(this.assistantSettleTimer);
    this.completeUserTurn();
    this.completeAssistantTurn();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.channel?.close();
    this.peer?.close();
    this.peer = undefined;
    this.ready = false;
    this.dispatchEvent(new CustomEvent("diagnostic", { detail: { event: "live.session.closed", sessionId: this.sessionId } }));
  }

  private send(event: object): void {
    if (!this.ready || this.channel?.readyState !== "open") throw new Error("GPT-Live session is not ready.");
    this.channel.send(JSON.stringify(event));
  }

  private handle(event: LiveEvent): void {
    if (event.type === "session.started") {
      this.ready = true;
      this.sessionId = event.session?.id;
      this.send({ type: "session.input_audio.mute", event_id: crypto.randomUUID() });
      this.dispatchEvent(new CustomEvent("ready", { detail: event.session?.id }));
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: { event: "live.session.started", sessionId: this.sessionId } }));
    } else if (event.type === "session.input_transcript.delta" || event.type === "session.output_transcript.delta") {
      const mutation = this.turns.acceptDelta({
        role: event.type.includes("input") ? "user" : "sutradhara",
        text: event.delta ?? "",
        startMs: event.start_ms ?? 0,
        endMs: event.end_ms ?? 0,
      });
      for (const completed of mutation.completed) this.emitCompletedTurn(completed);
      this.emitTurn(mutation.updated);
      if (mutation.updated.role === "user" && this.userSettleTimer) this.scheduleUserCompletion(250);
      if (mutation.updated.role === "sutradhara") this.scheduleAssistantCompletion();
    } else if (event.type === "session.delegation.created" && event.delegation?.target === "client") {
      const binding = this.turns.bindDelegation(event.delegation.id, event.offset_ms ?? 0);
      const detail = { ...binding, causalTurn: this.turns.turnForDelegation(binding.id) };
      if (detail.causalTurn && !detail.causalTurn.complete) {
        const pending = this.pendingDelegations.get(detail.causalTurn.id) ?? [];
        this.pendingDelegations.set(detail.causalTurn.id, [...pending, detail]);
      } else {
        this.emitDelegation(detail);
      }
    } else if (event.type === "session.input_audio.muted") {
      const turnId = event.client_event_id && this.muteTurns.get(event.client_event_id);
      if (turnId) {
        this.muteTurns.delete(event.client_event_id as string);
        const activeTurn = [...this.turns.list()].reverse().find((turn) => turn.role === "user" && !turn.complete);
        if (activeTurn?.id === turnId) this.scheduleUserCompletion(250);
      }
    } else if (event.type === "session.thinking.appended" || event.type === "session.commentary.appended") {
      this.dispatchEvent(new CustomEvent("append.acknowledged", { detail: {
        kind: event.type === "session.thinking.appended" ? "thinking" : "commentary",
        clientEventId: event.client_event_id,
      } }));
    } else if (event.type === "error") {
      this.dispatchEvent(new CustomEvent("live.error", { detail: {
        message: event.error?.message ?? "GPT-Live reported an error.",
        clientEventId: event.client_event_id ?? event.error?.client_event_id,
      } }));
    } else if (event.type === "session.closed") {
      this.ready = false;
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: { event: "live.session.closed", sessionId: this.sessionId } }));
      this.dispatchEvent(new Event("closed"));
    }
  }

  private emitTurn(turn: VoiceTurn): void {
    this.dispatchEvent(new CustomEvent("turn", { detail: turn }));
  }

  private emitCompletedTurn(turn: VoiceTurn): void {
    // Project the final complete=true snapshot before consumers handle either
    // the delegation or turn completion. React state may still be batching, so
    // the delegation also carries this causal snapshot as a fallback.
    this.emitTurn(turn);
    const pending = this.pendingDelegations.get(turn.id) ?? [];
    this.pendingDelegations.delete(turn.id);
    for (const delegation of pending) this.emitDelegation({ ...delegation, causalTurn: turn });
    this.dispatchEvent(new CustomEvent("turn.completed", { detail: turn }));
    if (turn.role === "user") {
      this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
        event: "live.user_turn.completed", sessionId: this.sessionId,
        detail: `turn=${turn.id}; characters=${turn.text.length}`,
      } }));
    }
  }

  private emitDelegation(detail: LiveDelegation): void {
    this.dispatchEvent(new CustomEvent("delegation", { detail }));
    this.dispatchEvent(new CustomEvent("diagnostic", { detail: {
      event: "live.delegation.created", sessionId: this.sessionId, delegationId: detail.id,
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
    if (completed) this.dispatchEvent(new CustomEvent("turn.completed", { detail: completed }));
  }

  private async waitForIce(): Promise<void> {
    if (this.peer?.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.peer?.removeEventListener("icegatheringstatechange", listener);
        resolve();
      }, 5_000);
      const listener = () => {
        if (this.peer?.iceGatheringState === "complete") {
          this.peer.removeEventListener("icegatheringstatechange", listener);
          clearTimeout(timeout);
          resolve();
        }
      };
      this.peer?.addEventListener("icegatheringstatechange", listener);
    });
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
}
