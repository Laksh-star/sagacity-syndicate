import { describe, expect, it, vi } from "vitest";
import { LiveAppendTracker } from "../client/voice/append-tracker.js";
import { InitialHandoffGate, VoiceDelegationCoordinator } from "../client/voice/delegation-coordinator.js";
import { LiveVoiceSession } from "../client/voice/live-session.js";
import { isNearTranscriptEnd, scrollTranscriptToLatest } from "../client/voice/transcript-scroll.js";
import { VoiceReadinessAssessmentSchema } from "../shared/schemas.js";

describe("voice council handoff", () => {
  it("starts exactly once when native delegation arrives", () => {
    const coordinator = new VoiceDelegationCoordinator();
    expect(coordinator.claimNative("turn_1", "item_1")).toBe("start");
    expect(coordinator.claimNative("turn_1", "item_1")).toBe("duplicate");
    expect(coordinator.claimFallback("turn_1")).toBe(false);
  });

  it("starts a fallback and only binds a later native delegation", () => {
    const coordinator = new VoiceDelegationCoordinator();
    expect(coordinator.claimFallback("turn_1")).toBe(true);
    expect(coordinator.claimNative("turn_1", "item_late")).toBe("bind");
    expect(coordinator.sourceFor("turn_1")).toBe("fallback");
  });

  it("prevents fallback duplication when native delegation wins the grace window", () => {
    const coordinator = new VoiceDelegationCoordinator();
    expect(coordinator.claimNative("turn_1", "item_1")).toBe("start");
    expect(coordinator.claimFallback("turn_1")).toBe(false);
  });

  it("allows only one pending initial fallback across completed voice turns", () => {
    const gate = new InitialHandoffGate();
    expect(gate.reserve("turn_1")).toBe(true);
    expect(gate.reserve("turn_2")).toBe(false);
    expect(gate.isCurrent("turn_1")).toBe(true);
    expect(gate.isReservedForOther("turn_2")).toBe(true);
  });

  it("lets a native delegation replace an older pending fallback", () => {
    const gate = new InitialHandoffGate();
    gate.reserve("turn_1");
    expect(gate.replace("turn_2")).toBe("turn_1");
    expect(gate.isCurrent("turn_2")).toBe(true);
  });

  it("allows verified completion appends without a delegation ID", () => {
    const sent: string[] = [];
    const session = new LiveVoiceSession();
    Object.assign(session, { ready: true, channel: { readyState: "open", send: (value: string) => sent.push(value) } });
    session.appendThinking("Verified council facts.", null);
    session.appendCommentary("Give a short briefing.", null);
    session.appendInstructions("Council status: COMPLETED.", null);
    expect(sent.map((value) => JSON.parse(value))).toEqual([
      expect.objectContaining({ type: "session.thinking.append", delegation_id: null }),
      expect.objectContaining({ type: "session.commentary.append", delegation_id: null }),
      expect.objectContaining({ type: "session.instructions.append", delegation_id: null }),
    ]);
  });

  it("correlates append acknowledgements to their revision", () => {
    const tracker = new LiveAppendTracker();
    tracker.register("event_1", { kind: "commentary", delegationId: null, revision: { conversationRevision: 2, deliberationRevision: 3 } });
    expect(tracker.acknowledge("event_1")).toEqual({ kind: "commentary", delegationId: null, revision: { conversationRevision: 2, deliberationRevision: 3 } });
    expect(tracker.acknowledge("event_1")).toBeUndefined();
  });

  it("keeps transcript autoscroll unless the user moved away from the latest turn", () => {
    const atEnd = { scrollHeight: 500, scrollTop: 280, clientHeight: 200 };
    const scrolledUp = { scrollHeight: 500, scrollTop: 100, clientHeight: 200 };
    expect(isNearTranscriptEnd(atEnd)).toBe(true);
    expect(isNearTranscriptEnd(scrolledUp)).toBe(false);
    scrollTranscriptToLatest(scrolledUp);
    expect(scrolledUp.scrollTop).toBe(500);
  });

  it("waits for late transcript fragments after microphone mute acknowledgement", () => {
    vi.useFakeTimers();
    try {
      const sent: Array<{ type: string; event_id?: string }> = [];
      const session = new LiveVoiceSession();
      Object.assign(session, {
        ready: true,
        stream: { getAudioTracks: () => [{ enabled: false }] },
        channel: { readyState: "open", send: (value: string) => sent.push(JSON.parse(value)) },
      });
      const completed: string[] = [];
      session.addEventListener("turn.completed", (event) => {
        const turn = (event as CustomEvent<{ role: string; text: string }>).detail;
        if (turn.role === "user") completed.push(turn.text);
      });

      session.setTalking(true);
      (session as unknown as { handle: (event: object) => void }).handle({
        type: "session.input_transcript.delta", delta: "My budget is ₹40,000, not ", start_ms: 0, end_ms: 700,
      });
      session.setTalking(false);
      const mute = [...sent].reverse().find((event) => event.type === "session.input_audio.mute");
      (session as unknown as { handle: (event: object) => void }).handle({
        type: "session.input_audio.muted", client_event_id: mute?.event_id,
      });

      vi.advanceTimersByTime(800);
      expect(completed).toEqual([]);
      (session as unknown as { handle: (event: object) => void }).handle({
        type: "session.input_transcript.delta", delta: "₹1 lakh.", start_ms: 700, end_ms: 900,
      });
      vi.advanceTimersByTime(999);
      expect(completed).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(completed).toEqual(["My budget is ₹40,000, not ₹1 lakh."]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("voice readiness schema", () => {
  it("requires a bounded missing fact only for clarification", () => {
    expect(VoiceReadinessAssessmentSchema.parse({ action: "convene", missingInformation: [], reason: "The decision is ready.", confidence: 0.9 }).action).toBe("convene");
    expect(() => VoiceReadinessAssessmentSchema.parse({ action: "clarify", missingInformation: [], reason: "More is needed.", confidence: 0.8 })).toThrow();
  });
});
