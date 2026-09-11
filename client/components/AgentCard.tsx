import type { AgentCardState, AgentName } from "../../shared/schemas";

const copy: Record<AgentName, { title: string; lens: string; glyph: string }> = {
  forethought: { title: "Forethought", lens: "Risks · scenarios · prevention", glyph: "F" },
  quickaction: { title: "Quickaction", lens: "Moves · adaptability · learning", glyph: "Q" },
  examiner: { title: "Examiner", lens: "Assumptions · options · tension", glyph: "E" },
};

export function AgentCard({ agent, state }: { agent: AgentName; state: AgentCardState }) {
  const details = copy[agent];
  return <article className={`agent-card agent-card--${state}`}>
    <div className="agent-glyph">{details.glyph}</div>
    <div>
      <h3>{details.title}</h3>
      <p>{details.lens}</p>
    </div>
    <span className="agent-state"><i />{state}</span>
  </article>;
}
