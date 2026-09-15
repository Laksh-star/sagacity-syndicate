import { describe, expect, it } from "vitest";
import { createCouncilTrace } from "../server/orchestration/council.js";
import { CouncilEventSchema, CouncilTraceSchema, type AgentName, type Critique, type SpecialistOpinion } from "../shared/schemas.js";

const agents: AgentName[] = ["forethought", "quickaction", "examiner"];
const opinions = Object.fromEntries(agents.map((agent) => [agent, {
  phase: "opinion",
  agent,
  stance: `${agent} identifies a bounded concern.`,
  observations: [`${agent} observes a testable condition.`],
  recommendation: `${agent} recommends one reversible move.`,
  confidence: 0.76,
  uncertainties: [`${agent} lacks one useful fact.`],
}])) as Record<AgentName, SpecialistOpinion>;
const critiques = Object.fromEntries(agents.map((agent) => [agent, {
  phase: "critique",
  critic: agent,
  targetAgents: agents.filter((candidate) => candidate !== agent),
  agreements: ["A bounded first step reduces exposure."],
  challenges: ["The first peer needs a measurable gate.", "The second peer needs a stop condition."],
  revisionAdvice: `${agent} advises a measurable checkpoint.`,
  severity: "medium",
}])) as Record<AgentName, Critique>;
const scroll = {
  decision: "Run a bounded pilot.",
  rationale: "The pilot creates evidence before commitment.",
  forethought: "Protect the downside before scaling.",
  quickaction: "Start a one-week test today.",
  examiner: "Test the assumption that the choice is binary.",
  triggerToReconvene: "Reconvene after the first measurable result.",
  confidence: 0.78,
};

describe("bounded council trace", () => {
  it("maps validated opinions and critiques into six directed challenge edges", () => {
    const trace = createCouncilTrace(opinions, critiques, scroll);
    expect(CouncilTraceSchema.parse(trace)).toEqual(trace);
    expect(trace.critiqueEdges).toHaveLength(6);
    expect(trace.contributions.forethought).toMatchObject({
      openedWith: "forethought recommends one reversible move.",
      survived: scroll.forethought,
    });
    expect(trace.critiqueEdges.every((edge) => edge.critic !== edge.target)).toBe(true);
    expect(trace.critiqueEdges.filter((edge) => edge.critic === "examiner").every((edge) => edge.challenge === "examiner advises a measurable checkpoint.")).toBe(true);
    expect(JSON.stringify(trace)).not.toContain("observations");
    expect(JSON.stringify(trace)).not.toContain("uncertainties");
  });

  it("travels with the verified result without changing the Decision Scroll", () => {
    const trace = createCouncilTrace(opinions, critiques, scroll);
    const event = CouncilEventSchema.parse({ type: "council.result", mode: "initial", scroll, trace });
    expect(event.type).toBe("council.result");
    if (event.type === "council.result") {
      expect(event.scroll).toEqual(scroll);
      expect(event.trace?.contributions.examiner.survived).toBe(scroll.examiner);
    }
  });
});
