import { DecisionScrollSchema, type DecisionScroll } from "./schemas.js";

const unverifiedEvidenceCeiling = 0.85;

export function calibrateRecommendationConfidence(
  scroll: DecisionScroll,
  keyEvidenceVerified = false,
): DecisionScroll {
  if (keyEvidenceVerified || scroll.confidence <= unverifiedEvidenceCeiling) return scroll;
  return DecisionScrollSchema.parse({ ...scroll, confidence: unverifiedEvidenceCeiling });
}
