import { describe, expect, it } from "vitest";
import { compareDecisionScrolls, createTypedCorrectionTurn, decisionMarkdownFilename, decisionToMarkdown } from "../client/decision-artifacts.js";
import type { DecisionHistoryEntry } from "../client/persisted-decision.js";

const entry: DecisionHistoryEntry = {
  version: 1,
  deliberationId: "decision_1",
  conversationRevision: 2,
  deliberationRevision: 1,
  roundMode: "initial",
  savedAt: "2026-09-14T10:00:00.000Z",
  scroll: {
    decision: "Run a bounded pilot.",
    rationale: "The pilot creates evidence.",
    forethought: "Protect the downside.",
    quickaction: "Start this week.",
    examiner: "Demand is assumed.",
    triggerToReconvene: "Review after ten users.",
    confidence: 0.74,
  },
};

describe("decision workspace artifacts", () => {
  it("exports the full verified Scroll as structured Markdown", () => {
    const markdown = decisionToMarkdown(entry);
    expect(markdown).toContain("# Sagacity Syndicate — Decision Scroll");
    expect(markdown).toContain("## Forethought — biggest future risk");
    expect(markdown).toContain("Run a bounded pilot.");
    expect(markdown).toContain("Confidence: 74%");
    expect(decisionMarkdownFilename(entry)).toBe("sagacity-decision-2026-09-14-r1.md");
  });

  it("compares every authoritative field and identifies revisions", () => {
    const rows = compareDecisionScrolls(entry.scroll, {
      ...entry.scroll,
      decision: "Delay the pilot.",
      confidence: 0.61,
    });
    expect(rows).toHaveLength(7);
    expect(rows.find((row) => row.field === "decision")?.changed).toBe(true);
    expect(rows.find((row) => row.field === "confidence")).toMatchObject({ initial: "74%", revised: "61%", changed: true });
    expect(rows.find((row) => row.field === "rationale")?.changed).toBe(false);
  });

  it("turns an explicit typed correction into one completed user turn", () => {
    expect(createTypedCorrectionTurn("  My budget is now ₹8 lakh.  ", 1234, "abc")).toEqual({
      id: "typed_abc",
      role: "user",
      text: "My budget is now ₹8 lakh.",
      startedAt: 1234,
      completedAt: 1234,
      complete: true,
    });
  });
});
