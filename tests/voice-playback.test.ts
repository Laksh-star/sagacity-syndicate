import { describe, expect, it } from "vitest";
import { LivePlaybackController } from "../client/voice/playback-controller.js";

describe("GPT-Live browser playback control", () => {
  it("suppresses current Sutradhara audio as soon as the user interrupts", () => {
    const sink = { muted: false };
    const playback = new LivePlaybackController(sink);
    expect(playback.acceptAssistantDelta(100)).toBe("started");
    expect(playback.interrupt()).toBe("suppressed");
    expect(playback.state()).toBe("suppressed");
    expect(sink.muted).toBe(true);
  });

  it("does not resume for output that predates the completed user turn", () => {
    const sink = { muted: false };
    const playback = new LivePlaybackController(sink);
    playback.acceptAssistantDelta(100);
    playback.interrupt();
    playback.completeUserTurn(500);

    expect(playback.acceptAssistantDelta(450)).toBe("stale_discarded");
    expect(playback.state()).toBe("awaiting_response");
    expect(sink.muted).toBe(true);
  });

  it("resumes only when a post-turn Sutradhara response begins", () => {
    const sink = { muted: false };
    const playback = new LivePlaybackController(sink);
    playback.interrupt();
    playback.completeUserTurn(500);

    expect(playback.acceptAssistantDelta(501)).toBe("resumed");
    expect(playback.state()).toBe("speaking");
    expect(sink.muted).toBe(false);
    expect(playback.finishAssistantTurn()).toBe("finished");
    expect(playback.state()).toBe("idle");
  });

  it("keeps output suppressed while the user is still speaking", () => {
    const sink = { muted: false };
    const playback = new LivePlaybackController(sink);
    playback.interrupt();

    expect(playback.acceptAssistantDelta(900)).toBe("stale_discarded");
    expect(playback.state()).toBe("suppressed");
    expect(sink.muted).toBe(true);
  });
});
