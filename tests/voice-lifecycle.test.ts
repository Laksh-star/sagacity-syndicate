import { describe, expect, it } from "vitest";
import { VoiceCouncilLifecycle } from "../client/voice/council-lifecycle.js";
import { DecisionScrollSchema } from "../shared/schemas.js";

const scroll = DecisionScrollSchema.parse({
  decision: "Run the pilot.", rationale: "It is reversible.", forethought: "Protect the downside.",
  quickaction: "Start with one team.", examiner: "The adoption assumption is untested.",
  triggerToReconvene: "Reconvene after one week.", confidence: 0.72,
});

describe("VoiceCouncilLifecycle", () => {
  it("binds the delegation-causing turn without treating it as an interruption", () => {
    const lifecycle = new VoiceCouncilLifecycle();
    lifecycle.startRound({ conversationRevision: 1, deliberationRevision: 1, delegationId: "item_1", causalTurnId: "turn_1", reconvening: false });
    expect(lifecycle.isCausalTurn("turn_1")).toBe(true);
    expect(lifecycle.isCausalTurn("turn_2")).toBe(false);
  });

  it("preserves the previous result while a material post-decision change reconvenes", () => {
    const lifecycle = new VoiceCouncilLifecycle();
    lifecycle.startRound({ conversationRevision: 1, deliberationRevision: 1, delegationId: "item_1", reconvening: false });
    expect(lifecycle.acceptResult({ conversationRevision: 1, deliberationRevision: 1 }, scroll)).toBe(true);
    lifecycle.startRound({ conversationRevision: 2, deliberationRevision: 2, delegationId: "item_2", reconvening: true });
    expect(lifecycle.verifiedResult()?.scroll).toEqual(scroll);
  });

  it("suppresses stale results after a newer round begins", () => {
    const lifecycle = new VoiceCouncilLifecycle();
    lifecycle.startRound({ conversationRevision: 1, deliberationRevision: 1, delegationId: "item_1", reconvening: false });
    lifecycle.startRound({ conversationRevision: 2, deliberationRevision: 2, delegationId: "item_2", reconvening: true });
    expect(lifecycle.acceptResult({ conversationRevision: 1, deliberationRevision: 1 }, scroll)).toBe(false);
    expect(lifecycle.verifiedResult()).toBeUndefined();
    expect(lifecycle.acceptResult({ conversationRevision: 2, deliberationRevision: 2 }, scroll)).toBe(true);
  });

  it("can attach a delegation that arrives after materiality routing started reconvening", () => {
    const lifecycle = new VoiceCouncilLifecycle();
    lifecycle.startRound({ conversationRevision: 2, deliberationRevision: 2, delegationId: null, reconvening: true });
    expect(lifecycle.bindDelegation("item_late", "turn_change")).toBe(true);
    expect(lifecycle.activeRound()).toMatchObject({ delegationId: "item_late", causalTurnId: "turn_change" });
  });
});
