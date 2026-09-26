import type { AgentCardState, AgentName, CouncilPhase } from "./schemas.js";

const transitions: Record<CouncilPhase, readonly CouncilPhase[]> = {
  idle: ["clarifying", "ready"],
  clarifying: ["ready", "idle"],
  confirming_constraint: ["ready", "routing", "independent", "cross_examining", "synthesizing", "completed", "interrupted", "failed", "idle"],
  ready: ["routing", "independent", "confirming_constraint", "idle"],
  routing: ["independent", "confirming_constraint", "completed", "interrupted", "failed"],
  independent: ["cross_examining", "confirming_constraint", "interrupted", "failed"],
  cross_examining: ["synthesizing", "confirming_constraint", "interrupted", "failed"],
  synthesizing: ["confirming_constraint", "completed", "interrupted", "failed"],
  completed: ["ready", "routing", "confirming_constraint", "idle"],
  interrupted: ["ready", "idle"],
  failed: ["ready", "idle"],
};

export function canTransition(from: CouncilPhase, to: CouncilPhase): boolean {
  return transitions[from].includes(to);
}

export function transition(from: CouncilPhase, to: CouncilPhase): CouncilPhase {
  if (!canTransition(from, to)) throw new Error(`Illegal council transition: ${from} -> ${to}`);
  return to;
}

export type CouncilState = {
  phase: CouncilPhase;
  conversationRevision: number;
  deliberationRevision: number;
  agents: Record<AgentName, AgentCardState>;
};

export const initialCouncilState = (): CouncilState => ({
  phase: "idle",
  conversationRevision: 0,
  deliberationRevision: 0,
  agents: { forethought: "waiting", quickaction: "waiting", examiner: "waiting" },
});

export function isCurrent(
  state: Pick<CouncilState, "conversationRevision" | "deliberationRevision">,
  captured: Pick<CouncilState, "conversationRevision" | "deliberationRevision">,
): boolean {
  return state.conversationRevision === captured.conversationRevision
    && state.deliberationRevision === captured.deliberationRevision;
}
