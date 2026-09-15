import { useEffect, useMemo, useState } from "react";
import type { AgentCardState, AgentName, CouncilPhase, CouncilTrace, DecisionScroll } from "../../shared/schemas";
import type { DecisionHistoryEntry } from "../persisted-decision";

const agents: AgentName[] = ["forethought", "quickaction", "examiner"];
const agentCopy: Record<AgentName, { title: string; animal: string; fable: string }> = {
  forethought: { title: "Forethought", animal: "🐢", fable: "patient turtle" },
  quickaction: { title: "Quickaction", animal: "🐇", fable: "nimble hare" },
  examiner: { title: "Examiner", animal: "🦉", fable: "watchful owl" },
};

function fallbackTrace(scroll: DecisionScroll): CouncilTrace {
  const unavailable = "The detailed cross-examination was not retained for this earlier revision.";
  return {
    contributions: {
      forethought: { agent: "forethought", openedWith: scroll.forethought, challenged: unavailable, survived: scroll.forethought },
      quickaction: { agent: "quickaction", openedWith: scroll.quickaction, challenged: unavailable, survived: scroll.quickaction },
      examiner: { agent: "examiner", openedWith: scroll.examiner, challenged: unavailable, survived: scroll.examiner },
    },
    critiqueEdges: [],
  };
}

function phaseLabel(phase: CouncilPhase): string {
  if (phase === "routing") return "Impact Router";
  if (phase === "independent") return "Independent views";
  if (phase === "cross_examining") return "Cross-exam";
  if (phase === "synthesizing") return "Synthesis";
  return "Cross-exam";
}

function boundedDecisionLabel(decision: string | undefined, max = 92): string | undefined {
  if (!decision || decision.length <= max) return decision;
  const shortened = decision.slice(0, max - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > max * 0.7 ? lastSpace : max - 1)}…`;
}

export function CouncilMap({
  entries,
  currentDeliberationId,
  currentScroll,
  currentTrace,
  mode,
  phase,
  agentStates,
  deliberationRevision,
  changedFact,
}: {
  entries: DecisionHistoryEntry[];
  currentDeliberationId?: string;
  currentScroll?: DecisionScroll;
  currentTrace?: CouncilTrace;
  mode: "conversation" | "deliberating" | "completed" | "reconvening";
  phase: CouncilPhase;
  agentStates: Record<AgentName, AgentCardState>;
  deliberationRevision: number;
  changedFact?: string;
}) {
  const revisions = useMemo(
    () => entries.filter((entry) => entry.deliberationId === currentDeliberationId),
    [entries, currentDeliberationId],
  );
  const newestRevision = revisions.at(-1)?.deliberationRevision;
  const [selectedRevision, setSelectedRevision] = useState(newestRevision);
  const [selectedAgent, setSelectedAgent] = useState<AgentName>("forethought");
  const [view, setView] = useState<"map" | "trail">("map");

  useEffect(() => { setSelectedRevision(newestRevision); }, [newestRevision]);

  const selectedEntry = revisions.find((entry) => entry.deliberationRevision === selectedRevision) ?? revisions.at(-1);
  const displayScroll = selectedEntry?.scroll ?? currentScroll;
  const retainedTrace = selectedEntry?.trace ?? currentTrace;
  const displayTrace = retainedTrace ?? (displayScroll ? fallbackTrace(displayScroll) : undefined);
  const active = mode === "deliberating" || mode === "reconvening";
  const visibleStates = active ? agentStates : { forethought: "done", quickaction: "done", examiner: "done" } as const;
  const contribution = displayTrace?.contributions[selectedAgent];

  return <section className={`council-map council-map--${active ? "active" : "complete"}`} aria-label="Council map">
    <div className="council-map__heading">
      <div><span className="eyebrow">How the council reached this</span><h3>{active ? phaseLabel(phase) : "Council map"}</h3></div>
      <div className="council-view-switch" role="group" aria-label="Council view">
        <button className={view === "map" ? "is-active" : ""} type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
        <button className={view === "trail" ? "is-active" : ""} type="button" aria-pressed={view === "trail"} onClick={() => setView("trail")}>Detailed trail</button>
      </div>
    </div>

    {active ? <p className="council-map__status">
      <strong>Revision {deliberationRevision} is active.</strong>{changedFact ? ` Changed: ${changedFact}` : " The specialists are working from the current decision context."}
    </p> : revisions.length > 1 ? <div className="revision-switch" role="group" aria-label="Decision revision">
      {revisions.map((entry) => <button
        type="button"
        key={entry.deliberationRevision}
        className={entry.deliberationRevision === selectedEntry?.deliberationRevision ? "is-active" : ""}
        aria-pressed={entry.deliberationRevision === selectedEntry?.deliberationRevision}
        onClick={() => setSelectedRevision(entry.deliberationRevision)}
      >Revision {entry.deliberationRevision}<small>{entry.roundMode}</small></button>)}
    </div> : null}

    {view === "map" ? <>
      <div className="council-map__stage">
        <svg viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="critique-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker>
            <marker id="survival-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker>
          </defs>
          <path className="critique-line" d="M245 78 Q500 5 755 78" markerEnd="url(#critique-arrow)" />
          <path className="critique-line" d="M785 112 Q680 190 555 196" markerEnd="url(#critique-arrow)" />
          <path className="critique-line" d="M445 196 Q320 190 215 112" markerEnd="url(#critique-arrow)" />
          <line className="survival-line" x1="170" y1="120" x2="445" y2="286" markerEnd="url(#survival-arrow)" />
          <line className="survival-line" x1="500" y1="82" x2="500" y2="286" markerEnd="url(#survival-arrow)" />
          <line className="survival-line" x1="830" y1="120" x2="555" y2="286" markerEnd="url(#survival-arrow)" />
        </svg>
        {agents.map((agent) => <button
          type="button"
          key={agent}
          className={`council-node council-node--${agent} council-node--${visibleStates[agent]} ${selectedAgent === agent ? "is-selected" : ""}`}
          aria-pressed={selectedAgent === agent}
          onClick={() => setSelectedAgent(agent)}
        >
          <span className="council-node__animal" aria-hidden="true">{agentCopy[agent].animal}</span>
          <strong>{agentCopy[agent].title}</strong>
          <small>{agentCopy[agent].fable}</small>
          <span className="council-node__state"><i />{visibleStates[agent]}</span>
        </button>)}
        <div className="council-map__cross"><span aria-hidden="true">↔</span><strong>{phaseLabel(phase)}</strong><small>{phase === "cross_examining" ? "all challenge all" : active ? "current council phase" : retainedTrace ? `${displayTrace?.critiqueEdges.length ?? 0} bounded challenges` : "detail not retained"}</small></div>
        <div className="council-map__synthesis"><span aria-hidden="true">📜</span><div><small>{active ? "AUTHORITATIVE RESULT PENDING" : "SURVIVED SYNTHESIS"}</small><strong>{active ? (mode === "reconvening" ? "Previous decision remains visible" : "Decision Scroll will appear after verification") : boundedDecisionLabel(displayScroll?.decision)}</strong></div></div>
      </div>
      {contribution && !active ? <article className="council-contribution" aria-live="polite">
        <header><span aria-hidden="true">{agentCopy[selectedAgent].animal}</span><strong>{agentCopy[selectedAgent].title}</strong></header>
        <div><p><small>{retainedTrace ? "Opened with" : "Recorded perspective"}</small>{contribution.openedWith}</p><p><small>Challenged</small>{contribution.challenged}</p><p><small>Survived</small>{contribution.survived}</p></div>
      </article> : null}
    </> : displayTrace && displayScroll ? <div className="council-trail">
      <p className="council-trail__note">Concise, schema-bounded council outputs; no private reasoning.</p>
      <div className="council-trail__agents">{agents.map((agent) => {
        const item = displayTrace.contributions[agent];
        return <article key={agent}><header><span aria-hidden="true">{agentCopy[agent].animal}</span><strong>{agentCopy[agent].title}</strong></header><p><small>{retainedTrace ? "Initial position" : "Recorded perspective"}</small>{item.openedWith}</p><p><small>Critique</small>{item.challenged}</p><p><small>In synthesis</small>{item.survived}</p></article>;
      })}</div>
      <div className="council-trail__critiques"><strong>Cross-examination</strong>{displayTrace.critiqueEdges.length ? displayTrace.critiqueEdges.map((edge, index) => <p key={`${edge.critic}:${edge.target}:${index}`}><span>{agentCopy[edge.critic].title} → {agentCopy[edge.target].title}</span>{edge.challenge}</p>) : <p><span>Earlier revision</span>Detailed critique edges were not retained.</p>}</div>
      <div className="council-trail__result"><small>Surviving synthesis</small><strong>{displayScroll.decision}</strong></div>
    </div> : <p className="council-map__status">The detailed trail becomes available after verified synthesis.</p>}
  </section>;
}
