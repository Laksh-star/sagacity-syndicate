import { describe, expect, it } from "vitest";
import { PendingDecisionCaptureController } from "../client/voice/pending-decision-capture.js";
import type { LiveDelegation, VoiceTurn } from "../client/voice/live-session.js";

const turn = (id: string, text: string): VoiceTurn => ({ id, role: "user", text, complete: true });
const delegation = (id: string, causalTurn: VoiceTurn): LiveDelegation => ({
  id,
  causalTurnId: causalTurn.id,
  offsetMs: 100,
  causalTurn,
});

function pending(): PendingDecisionCaptureController {
  const controller = new PendingDecisionCaptureController();
  controller.set({ question: "Should we run the pilot?", context: "Confirmed decision question: Should we run the pilot?", causalTurnId: "decision" });
  return controller;
}

describe("PendingDecisionCaptureController", () => {
  it("ignores a causal-turn replay and retains its first delegation idempotently", () => {
    const controller = pending();
    const causal = turn("decision", "Should we run the pilot?");
    const first = delegation("item_first", causal);
    const duplicate = delegation("item_duplicate", causal);

    expect(controller.resolveTurn(causal, first).kind).toBe("ignored");
    expect(controller.attachDelegation(causal.id, duplicate)).toBe(true);
    expect(controller.current()?.delegation?.id).toBe(first.id);
  });

  it("starts exactly once on yes and prefers the confirming turn delegation", () => {
    const controller = pending();
    const causal = turn("decision", "Should we run the pilot?");
    controller.attachDelegation(causal.id, delegation("item_first", causal));
    const approval = turn("approval", "yes");
    const approvalDelegation = delegation("item_confirm", approval);

    expect(controller.resolveTurn(approval, approvalDelegation)).toMatchObject({
      kind: "start",
      delegation: { id: "item_confirm" },
    });
    expect(controller.resolveTurn(approval, approvalDelegation)).toEqual({ kind: "none" });
  });

  it("falls back to the stored decision-turn delegation when yes has none", () => {
    const controller = pending();
    const causal = turn("decision", "Should we run the pilot?");
    controller.attachDelegation(causal.id, delegation("item_first", causal));
    expect(controller.resolveTurn(turn("approval", "yes"))).toMatchObject({
      kind: "start",
      delegation: { id: "item_first" },
    });
  });

  it("rejects and asks for restatement without starting", () => {
    const controller = pending();
    expect(controller.resolveTurn(turn("rejection", "no, that is not my decision"))).toMatchObject({ kind: "restate" });
    expect(controller.current()).toBeUndefined();
    expect(controller.resolveTurn(turn("rejection", "no"))).toEqual({ kind: "none" });
  });
});
