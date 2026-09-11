import type { AgentCardState, AgentName, CouncilPhase } from "./schemas.js";

const transitions: Record<CouncilPhase, readonly CouncilPhase[]> = {
  idle: ["clarifying", "ready"],
  clarifying: ["ready", "idle"],
  ready: ["routing", "independent", "idle"],
  routing: ["independent", "completed", "interrupted", "failed"],
  independent: ["cross_examining", "interrupted", "failed"],
  cross_examining: ["synthesizing", "interrupted", "failed"],
  synthesizing: ["completed", "interrupted", "failed"],
  completed: ["ready", "routing", "idle"],
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
