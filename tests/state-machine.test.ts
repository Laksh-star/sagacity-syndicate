import { describe, expect, it } from "vitest";
import { canTransition, initialCouncilState, isCurrent, transition } from "../shared/state-machine.js";

describe("council state machine", () => {
  it("allows the formal happy path", () => {
    const path = ["ready", "independent", "cross_examining", "synthesizing", "completed"] as const;
    let phase = initialCouncilState().phase;
    for (const next of path) phase = transition(phase, next);
    expect(phase).toBe("completed");
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("idle", "completed")).toBe(false);
    expect(() => transition("idle", "completed")).toThrow(/Illegal council transition/);
  });

  it("represents confirmation as a state before a revised round", () => {
    expect(transition("completed", "confirming_constraint")).toBe("confirming_constraint");
    expect(transition("confirming_constraint", "routing")).toBe("routing");
    expect(transition("independent", "confirming_constraint")).toBe("confirming_constraint");
  });

  it("requires both revisions to match", () => {
    expect(isCurrent({ conversationRevision: 2, deliberationRevision: 3 }, { conversationRevision: 2, deliberationRevision: 3 })).toBe(true);
    expect(isCurrent({ conversationRevision: 3, deliberationRevision: 3 }, { conversationRevision: 2, deliberationRevision: 3 })).toBe(false);
    expect(isCurrent({ conversationRevision: 2, deliberationRevision: 4 }, { conversationRevision: 2, deliberationRevision: 3 })).toBe(false);
  });
});
