import { describe, expect, it } from "vitest";
import { decisionPresentation } from "../client/decision-presentation.js";

describe("Decision Scroll presentation", () => {
  it("separates a preserved question from the authoritative recommendation", () => {
    expect(decisionPresentation("Should we prioritize LinkedIn or Upwork? Decision: Prioritize LinkedIn and test Upwork tactically.")).toEqual({
      question: "Should we prioritize LinkedIn or Upwork?",
      recommendation: "Prioritize LinkedIn and test Upwork tactically.",
    });
  });

  it("leaves recommendation-only decisions unchanged", () => {
    expect(decisionPresentation("Run a reversible six-week pilot.")).toEqual({ recommendation: "Run a reversible six-week pilot." });
  });
});
