import type { z } from "zod";
import type { AgentRuntime, AgentRun } from "./runtime.js";

const delay = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, 90);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    reject(new DOMException("Aborted", "AbortError"));
  }, { once: true });
});

export class MockAgentRuntime implements AgentRuntime {
  private sessions = new Map<string, string>();

  async start<T>({ instructions, input, schema, signal }: { model: string; instructions: string; input: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<AgentRun<T>> {
    await delay(signal);
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, instructions);
    return { sessionId, output: schema.parse(this.fixture(instructions, input)) as T };
  }

  async continue<T>({ sessionId, input, schema, signal }: { sessionId: string; input: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<AgentRun<T>> {
    await delay(signal);
    const instructions = this.sessions.get(sessionId) ?? "";
    return { sessionId, output: schema.parse(this.fixture(instructions, input)) as T };
  }

  async cancel(_sessionId: string): Promise<void> {}

  private fixture(instructions: string, input: string): unknown {
    const lower = instructions.toLowerCase();
    if (lower.includes("voice interruption materiality")) {
      const parsed = JSON.parse(input) as { utterance?: string };
      const utterance = parsed.utterance ?? "";
      const material = /budget|deadline|cannot|can't|already accepted|instead of|remove|half|double|no longer/iu.test(utterance);
      return material
        ? { material: true, changedConstraint: utterance, reason: "This utterance changes a decision constraint.", confidence: 0.94 }
        : { material: false, changedConstraint: null, reason: "This utterance does not change a decision constraint.", confidence: 0.86 };
    }
    if (lower.includes("impact router")) {
      const material = !/spelling|wording|typo/i.test(input);
      const affected = /budget|cost|cash/i.test(input)
        ? ["quickaction", "examiner"]
        : /deadline|today|urgent|time/i.test(input)
          ? ["forethought", "quickaction"]
          : ["forethought", "quickaction", "examiner"];
      return {
        material,
        affectedAgents: material ? affected : [],
        reason: material ? "The new constraint can change feasibility or sequencing." : "The change does not alter the decision substance.",
        preservedFields: material ? ["triggerToReconvene"] : ["decision", "rationale", "forethought", "quickaction", "examiner", "triggerToReconvene", "confidence"],
        confidence: 0.82,
      };
    }
    if (lower.includes("synthesizer")) {
      return {
        decision: "Run a bounded, reversible pilot before making the full commitment.",
        rationale: "The council agrees that early evidence is more valuable than an irreversible choice. Start small, define a stop condition, and reassess after the first measurable result.",
        forethought: "The largest risk is scaling before the key assumption has been tested.",
        quickaction: "Define a one-week pilot with an owner, budget cap, and success metric today.",
        examiner: "The hidden assumption is that the decision must be all-or-nothing.",
        triggerToReconvene: "Reconvene if the pilot exceeds its budget cap or misses its success metric.",
        confidence: 0.78,
      };
    }
    const agent = lower.includes("forethought") ? "forethought" : lower.includes("quickaction") ? "quickaction" : "examiner";
    if (input.includes('"phase":"critique"')) {
      return {
        phase: "critique",
        critic: agent,
        targetAgents: (["forethought", "quickaction", "examiner"] as const).filter((name) => name !== agent),
        agreements: ["A reversible first step reduces avoidable exposure."],
        challenges: ["The proposal needs an explicit success threshold before action."],
        revisionAdvice: "Tie the recommendation to one measurable checkpoint and a stop condition.",
        severity: "medium",
      };
    }
    const copy = {
      forethought: ["A premature commitment could create avoidable lock-in.", "Test reversibility before scaling."],
      quickaction: ["A small pilot produces useful evidence quickly.", "Choose an owner and a near-term checkpoint."],
      examiner: ["The apparent binary choice may omit a staged option.", "The success criterion is not yet explicit."],
    }[agent];
    return {
      phase: "opinion",
      agent,
      stance: copy[0],
      observations: copy,
      recommendation: agent === "quickaction" ? "Launch a bounded pilot now." : "Make the next step reversible and evidence-producing.",
      confidence: 0.76,
      uncertainties: ["The available context may omit stakeholder constraints."],
    };
  }
}
