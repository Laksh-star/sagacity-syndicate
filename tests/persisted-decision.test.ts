import { describe, expect, it } from "vitest";
import { DECISION_HISTORY_LIMIT, clearDecisionHistory, clearPersistedDecision, loadDecisionHistory, loadPersistedDecision, persistDecision, recordDecisionHistory, reconveningDecisionContext, restoredDecisionContext } from "../client/persisted-decision.js";
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
const trace = {
  contributions: {
    forethought: { agent: "forethought" as const, openedWith: "Protect the downside.", challenged: "Require an explicit stop condition.", survived: "Protect the downside." },
    quickaction: { agent: "quickaction" as const, openedWith: "Start with one team.", challenged: "Set a measurable checkpoint.", survived: "Start with one team." },
    examiner: { agent: "examiner" as const, openedWith: "Test the binary framing.", challenged: "Name the missing alternative.", survived: "The binary framing is untested." },
  },
  critiqueEdges: [
    { critic: "examiner" as const, target: "quickaction" as const, challenge: "The pilot needs a clear success threshold.", severity: "medium" as const },
  ],
};

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
      trace,
    }, storage)).toBe(true);

    expect(loadPersistedDecision(storage)).toMatchObject({
      version: 1,
      deliberationId: "decision_1",
      conversationRevision: 4,
      deliberationRevision: 2,
      roundMode: "selective",
      scroll,
      trace,
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
    expect(context).toContain("Prior reconvene trigger:");
    expect(context).toContain("Prior confidence: 76%.");
    expect(context.length).toBeLessThanOrEqual(8_000);
  });

  it("combines a restored Scroll with the latest changed constraint", () => {
    const context = reconveningDecisionContext(scroll, "User: Actually, I need to decide within five days.");
    expect(context).toContain("Prior verified decision: Run the pilot.");
    expect(context).toContain("Actually, I need to decide within five days.");
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

  it("retains a bounded, revision-deduplicated local decision history", () => {
    const storage = new MemoryStorage();
    for (let revision = 1; revision <= DECISION_HISTORY_LIMIT + 3; revision += 1) {
      recordDecisionHistory({
        deliberationId: "decision_1",
        conversationRevision: revision,
        deliberationRevision: revision,
        roundMode: revision === 1 ? "initial" : "selective",
        scroll: { ...scroll, decision: `Run pilot revision ${revision}.` },
      }, storage);
    }
    recordDecisionHistory({
      deliberationId: "decision_1",
      conversationRevision: DECISION_HISTORY_LIMIT + 3,
      deliberationRevision: DECISION_HISTORY_LIMIT + 3,
      roundMode: "selective",
      scroll: { ...scroll, decision: "Replace the latest revision." },
    }, storage);

    const history = loadDecisionHistory(storage);
    expect(history).toHaveLength(DECISION_HISTORY_LIMIT);
    expect(history[0]?.deliberationRevision).toBe(4);
    expect(history.at(-1)?.scroll.decision).toBe("Replace the latest revision.");
    expect(JSON.stringify(history)).not.toContain("transcript");
  });

  it("clears history independently of the current authoritative decision", () => {
    const storage = new MemoryStorage();
    persistDecision({ deliberationId: "decision_1", conversationRevision: 1, deliberationRevision: 1, roundMode: "initial", scroll }, storage);
    recordDecisionHistory({ deliberationId: "decision_1", conversationRevision: 1, deliberationRevision: 1, roundMode: "initial", scroll }, storage);
    clearDecisionHistory(storage);
    expect(loadPersistedDecision(storage)?.scroll).toEqual(scroll);
    // With no explicit history record, migration safely exposes the current Scroll.
    expect(loadDecisionHistory(storage)).toHaveLength(1);
  });
});
