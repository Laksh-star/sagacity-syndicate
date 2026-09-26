import { describe, expect, it } from "vitest";
import { calibrateRecommendationConfidence } from "../shared/confidence.js";
import type { DecisionScroll } from "../shared/schemas.js";

const scroll = (confidence: number): DecisionScroll => ({
  decision: "Run a bounded pilot.",
  rationale: "It creates evidence before an irreversible commitment.",
  forethought: "Avoid scaling before the main risk is tested.",
  quickaction: "Set a budget cap and begin a one-week pilot.",
  examiner: "The choice is not necessarily all-or-nothing.",
  triggerToReconvene: "Reconvene when the pilot produces its first result.",
  confidence,
});

describe("recommendation confidence calibration", () => {
  it("caps council confidence while key evidence is unverified", () => {
    expect(calibrateRecommendationConfidence(scroll(0.96)).confidence).toBe(0.85);
  });

  it("does not inflate or reduce an already conservative confidence", () => {
    expect(calibrateRecommendationConfidence(scroll(0.72)).confidence).toBe(0.72);
  });

  it("allows the verified-evidence band when the caller can prove it", () => {
    expect(calibrateRecommendationConfidence(scroll(0.96), true).confidence).toBe(0.96);
  });
});
