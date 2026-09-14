export type LivePlaybackState = "idle" | "speaking" | "suppressed" | "awaiting_response";
export type LivePlaybackTransition = "none" | "started" | "suppressed" | "resumed" | "stale_discarded" | "finished";

type PlaybackSink = { muted: boolean };

export class LivePlaybackController {
  private current: LivePlaybackState = "idle";
  private userCompletedAtMs?: number;

  constructor(private readonly sink: PlaybackSink) {}

  state(): LivePlaybackState {
    return this.current;
  }

  interrupt(): LivePlaybackTransition {
    this.sink.muted = true;
    this.userCompletedAtMs = undefined;
    const wasSpeaking = this.current === "speaking";
    this.current = "suppressed";
    return wasSpeaking ? "suppressed" : "none";
  }

  completeUserTurn(completedAtMs?: number): LivePlaybackTransition {
    if (this.current !== "suppressed") return "none";
    this.userCompletedAtMs = completedAtMs;
    this.current = "awaiting_response";
    return "none";
  }

  acceptAssistantDelta(startMs: number): LivePlaybackTransition {
    if (this.current === "suppressed") return "stale_discarded";
    if (this.current === "awaiting_response") {
      if (this.userCompletedAtMs !== undefined && startMs <= this.userCompletedAtMs) return "stale_discarded";
      this.sink.muted = false;
      this.current = "speaking";
      return "resumed";
    }
    if (this.current === "idle") {
      this.sink.muted = false;
      this.current = "speaking";
      return "started";
    }
    return "none";
  }

  finishAssistantTurn(): LivePlaybackTransition {
    if (this.current !== "speaking") return "none";
    this.current = "idle";
    return "finished";
  }

  reset(): void {
    this.sink.muted = false;
    this.userCompletedAtMs = undefined;
    this.current = "idle";
  }
}
