import { describe, expect, it } from "vitest";
import { CritiqueSchema, DecisionScrollSchema, ImpactRouteSchema, SpecialistOpinionSchema } from "../shared/schemas.js";

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
});
