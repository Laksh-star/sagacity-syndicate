import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConstraintConfirmationSchema, CritiqueSchema, DecisionScrollOutputSchema, DecisionScrollSchema, ImpactRouteSchema, SpecialistOpinionSchema } from "../shared/schemas.js";

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

  it("states the enforced specialist text limits in every specialist prompt", () => {
    for (const prompt of ["forethought", "quickaction", "examiner"]) {
      const content = readFileSync(new URL(`../prompts/${prompt}.md`, import.meta.url), "utf8");
      expect(content).toContain("Hard limits, enforced by validation");
      expect(content).toContain("stance at most 240 characters");
      expect(content).toContain("each observation at most 220");
      expect(content).toContain("recommendation at most 300");
      expect(content).toContain("each uncertainty at most 180");
      expect(content).toContain("Never end a field mid-thought, with a dangling connector, or with colliding punctuation.");
      expect(content).toContain("Never put JSON fragments inside a string field.");
    }
  });

  it("rejects mechanically broken prose before it becomes authoritative", () => {
    const opinion = {
      phase: "opinion" as const, agent: "quickaction" as const, stance: "Proceed carefully.",
      observations: ["Track qualified replies."], recommendation: "Track deal size,.", confidence: 0.7, uncertainties: [],
    };
    expect(SpecialistOpinionSchema.safeParse(opinion).success).toBe(false);
    expect(SpecialistOpinionSchema.safeParse({ ...opinion, recommendation: "Prioritize Upwork short term and." }).success).toBe(false);
    expect(SpecialistOpinionSchema.safeParse({ ...opinion, recommendation: "Track metrics.`\",\"Track more." }).success).toBe(false);
    const generatedScroll = {
      decision: "Choose LinkedIn with explicit metrics and .", rationale: "It better supports relationship-led work.",
      forethought: "Protect against channel concentration.", quickaction: "Run a six-week comparison.",
      examiner: "Validate the target buyer's actual behavior.", triggerToReconvene: "Review after six weeks.", confidence: 0.78,
    };
    expect(DecisionScrollOutputSchema.safeParse(generatedScroll).success).toBe(false);
    expect(DecisionScrollSchema.safeParse(generatedScroll).success).toBe(true);
  });

  it("reserves completion headroom inside provider hard caps", () => {
    const capShaped = "Run an 8-week split test. Weeks 1–2: polish LinkedIn profile, publish four value posts, and send 20 targeted outreach messages. Weeks 1–8: submit 8–12 tailored marketplace proposals. Track weekly leads, meetings, closed revenue, and gross margin. Decision rule: after 8 weeks, choose the channelthat.";
    expect(capShaped).toHaveLength(300);
    expect(SpecialistOpinionSchema.safeParse({
      phase: "opinion", agent: "quickaction", stance: "Run a bounded test.",
      observations: ["Track qualified meetings."], recommendation: capShaped, confidence: 0.7, uncertainties: [],
    }).success).toBe(false);
  });
});
