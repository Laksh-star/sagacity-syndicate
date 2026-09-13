import { describe, expect, it } from "vitest";
import { clearPersistedDecision, loadPersistedDecision, persistDecision, restoredDecisionContext } from "../client/persisted-decision.js";
import { DecisionScrollSchema } from "../shared/schemas.js";

const scroll = DecisionScrollSchema.parse({
  decision: "Run the pilot.",
  rationale: "It produces evidence before commitment.",
  forethought: "Protect the downside.",
  quickaction: "Start with one team.",
  examiner: "The binary framing is untested.",
  triggerToReconvene: "Reconvene after one week.",
  confidence: 0.76,
});

class MemoryStorage {
  private value = new Map<string, string>();
  getItem(key: string) { return this.value.get(key) ?? null; }
  setItem(key: string, value: string) { this.value.set(key, value); }
  removeItem(key: string) { this.value.delete(key); }
}

describe("authoritative decision persistence", () => {
  it("restores only the bounded Scroll and revision record", () => {
    const storage = new MemoryStorage();
    expect(persistDecision({
      deliberationId: "decision_1",
      conversationRevision: 4,
      deliberationRevision: 2,
      roundMode: "selective",
      scroll,
    }, storage)).toBe(true);

    expect(loadPersistedDecision(storage)).toMatchObject({
      version: 1,
      deliberationId: "decision_1",
      conversationRevision: 4,
      deliberationRevision: 2,
      roundMode: "selective",
      scroll,
    });
    expect(JSON.stringify(loadPersistedDecision(storage))).not.toContain("transcript");
  });

  it("rejects and removes invalid stored state", () => {
    const storage = new MemoryStorage();
    storage.setItem("sagacity-syndicate.authoritative-decision.v1", "{\"version\":1,\"scroll\":{}}");
    expect(loadPersistedDecision(storage)).toBeUndefined();
    expect(storage.getItem("sagacity-syndicate.authoritative-decision.v1")).toBeNull();
  });

  it("reconstructs bounded prior context without the raw conversation", () => {
    const context = restoredDecisionContext(scroll);
    expect(context).toContain("Prior verified decision: Run the pilot.");
    expect(context).toContain("Prior Examiner view:");
    expect(context.length).toBeLessThanOrEqual(8_000);
  });

  it("clears the persisted decision when a user starts over", () => {
    const storage = new MemoryStorage();
    persistDecision({
      deliberationId: "decision_1", conversationRevision: 1, deliberationRevision: 1, roundMode: "initial", scroll,
    }, storage);
    clearPersistedDecision(storage);
    expect(loadPersistedDecision(storage)).toBeUndefined();
  });
});
