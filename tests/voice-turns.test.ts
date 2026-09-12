import { describe, expect, it } from "vitest";
import { VoiceTurnTracker } from "../client/voice/turn-tracker.js";
import { VoiceCouncilLifecycle } from "../client/voice/council-lifecycle.js";
import { DecisionScrollSchema } from "../shared/schemas.js";

describe("VoiceTurnTracker", () => {
  it("keeps delayed deltas from the delegation-causing utterance in the same turn", () => {
    const tracker = new VoiceTurnTracker();
    const started = tracker.beginUserTurn(100);
    tracker.acceptDelta({ role: "user", text: "Should I move ", startMs: 100, endMs: 500 });
    const delegation = tracker.bindDelegation("item_delegate", 700);
    tracker.acceptDelta({ role: "user", text: "to Bangalore?", startMs: 500, endMs: 690 });
    const completed = tracker.completeUserTurn(700);

    expect(delegation.causalTurnId).toBe(started.id);
    expect(completed).toMatchObject({ id: started.id, text: "Should I move to Bangalore?", complete: true });
    expect(tracker.isCausalTurn(completed!.id, delegation.id)).toBe(true);
    expect(tracker.list()).toHaveLength(1);
  });

  it("merges late transcript delivery into a completed causal turn without creating a new turn", () => {
    const tracker = new VoiceTurnTracker();
    tracker.beginUserTurn(100);
    tracker.acceptDelta({ role: "user", text: "My budget is ", startMs: 100, endMs: 400 });
    const completed = tracker.completeUserTurn(450)!;
    tracker.bindDelegation("item_delegate", 500);
    tracker.acceptDelta({ role: "user", text: "twenty lakh.", startMs: 400, endMs: 480 });

    expect(tracker.list()).toHaveLength(1);
    expect(tracker.list()[0]).toMatchObject({ id: completed.id, text: "My budget is twenty lakh.", complete: true });
  });

  it("lets synthesis complete when a trailing delta belongs to the delegation-causing turn", () => {
    const tracker = new VoiceTurnTracker();
    const lifecycle = new VoiceCouncilLifecycle();
    const turn = tracker.beginUserTurn(10);
    tracker.acceptDelta({ role: "user", text: "Should I take ", startMs: 10, endMs: 200 });
    const delegation = tracker.bindDelegation("delegate_1", 350);
    lifecycle.startRound({ conversationRevision: 1, deliberationRevision: 1, delegationId: delegation.id, causalTurnId: turn.id, reconvening: false });

    tracker.acceptDelta({ role: "user", text: "the role?", startMs: 200, endMs: 340 });
    const completed = tracker.completeUserTurn(350)!;
    expect(lifecycle.isCausalTurn(completed.id)).toBe(true);

    const result = DecisionScrollSchema.parse({
      decision: "Take a reversible next step.", rationale: "It tests the key uncertainty.",
      forethought: "Protect the downside.", quickaction: "Verify the offer.",
      examiner: "The role scope is assumed.", triggerToReconvene: "Revisit after verification.", confidence: 0.8,
    });
    expect(lifecycle.acceptResult({ conversationRevision: 1, deliberationRevision: 1 }, result)).toBe(true);
  });
});
