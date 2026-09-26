import { describe, expect, it } from "vitest";
import { ConstraintConfirmationSchema, CritiqueSchema, DecisionScrollSchema, ImpactRouteSchema, SpecialistOpinionSchema } from "../shared/schemas.js";

describe("bounded council schemas", () => {
  it("accepts valid specialist and critique payloads", () => {
    expect(SpecialistOpinionSchema.parse({
      phase: "opinion", agent: "forethought", stance: "Proceed carefully.", observations: ["Risk exists."],
      recommendation: "Pilot first.", confidence: 0.7, uncertainties: [],
    }).agent).toBe("forethought");
    expect(CritiqueSchema.parse({
      phase: "critique", critic: "examiner", targetAgents: ["quickaction"], agreements: [],
      challenges: ["The threshold is missing."], revisionAdvice: "Add a threshold.", severity: "medium",
    }).severity).toBe("medium");
  });

  it("rejects invalid routing and out-of-range confidence", () => {
    expect(() => ImpactRouteSchema.parse({
      material: true, affectedAgents: [], reason: "Material.", preservedFields: [], confidence: 0.8,
    })).toThrow();
    expect(() => DecisionScrollSchema.parse({
      decision: "Decide", rationale: "Because", forethought: "Risk", quickaction: "Move", examiner: "Assumption",
      triggerToReconvene: "Trigger", confidence: 2,
    })).toThrow();
  });

  it("bounds pending material-constraint confirmations", () => {
    expect(ConstraintConfirmationSchema.parse({
      changedConstraint: "The budget is ₹40,000.",
      confirmationQuestion: "I understood the budget as ₹40,000. Is that correct?",
      newValue: "₹40,000",
      interpretationConfidence: 0.91,
      conversationRevision: 4,
      createdAt: 1234,
    }).newValue).toBe("₹40,000");
    expect(() => ConstraintConfirmationSchema.parse({
      changedConstraint: "The budget changed.",
      confirmationQuestion: "Confirm",
      interpretationConfidence: 2,
      conversationRevision: 4,
      createdAt: 1234,
    })).toThrow();
  });
});
