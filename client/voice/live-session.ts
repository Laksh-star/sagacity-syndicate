export type TranscriptSegment = { role: "user" | "sutradhara"; text: string; startMs: number; endMs: number };

type LiveEvent = {
  type: string;
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  delegation?: { id: string; target: string };
  session?: { id: string };
};

export class LiveVoiceSession extends EventTarget {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private output?: HTMLAudioElement;
  private ready = false;

  async connect(): Promise<void> {
    if (this.peer) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not start GPT-Live.");
    const result = await response.json() as { transport: { sdp: string } };
    await this.peer.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
  }

  setTalking(active: boolean): void {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = active; });
    this.dispatchEvent(new CustomEvent("talking", { detail: active }));
  }

  appendThinking(content: string, delegationId: string | null): void {
    this.send({ type: "session.thinking.append", event_id: crypto.randomUUID(), delegation_id: delegationId, content: content.slice(0, 1_200) });
  }

  appendCommentary(content: string, delegationId: string): void {
    this.send({ type: "session.commentary.append", event_id: crypto.randomUUID(), delegation_id: delegationId, content: content.slice(0, 1_200) });
  }

  close(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.channel?.close();
    this.peer?.close();
    this.peer = undefined;
    this.ready = false;
  }

  private send(event: object): void {
    if (!this.ready || this.channel?.readyState !== "open") throw new Error("GPT-Live session is not ready.");
    this.channel.send(JSON.stringify(event));
  }

  private handle(event: LiveEvent): void {
    if (event.type === "session.started") {
      this.ready = true;
      this.dispatchEvent(new CustomEvent("ready", { detail: event.session?.id }));
    } else if (event.type === "session.input_transcript.delta" || event.type === "session.output_transcript.delta") {
      const segment: TranscriptSegment = {
        role: event.type.includes("input") ? "user" : "sutradhara",
        text: event.delta ?? "",
        startMs: event.start_ms ?? 0,
        endMs: event.end_ms ?? 0,
      };
      this.dispatchEvent(new CustomEvent("transcript", { detail: segment }));
    } else if (event.type === "session.delegation.created" && event.delegation?.target === "client") {
      this.dispatchEvent(new CustomEvent("delegation", { detail: event.delegation.id }));
    } else if (event.type === "session.closed") {
      this.ready = false;
      this.dispatchEvent(new Event("closed"));
    }
  }

  private async waitForIce(): Promise<void> {
    if (this.peer?.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const listener = () => {
        if (this.peer?.iceGatheringState === "complete") {
          this.peer.removeEventListener("icegatheringstatechange", listener);
          resolve();
        }
      };
      this.peer?.addEventListener("icegatheringstatechange", listener);
    });
  }
}
