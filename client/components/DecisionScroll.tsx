import type { DecisionScroll as DecisionScrollType } from "../../shared/schemas";

export function DecisionScroll({ scroll, mode }: { scroll?: DecisionScrollType; mode: "conversation" | "deliberating" | "completed" | "reconvening" }) {
  if (!scroll) return <section className="scroll scroll--empty">
    <span className="eyebrow">Decision scroll</span>
    <h2>{mode === "deliberating" ? "A verified decision will appear here." : "Ready when you are."}</h2>
    <p>{mode === "deliberating" ? "The agent cards show the live council phase." : "Give Sutradhara the decision, hard constraints, and time horizon."}</p>
  </section>;
  const entries = [
    ["Rationale", scroll.rationale],
    ["Forethought · biggest future risk", scroll.forethought],
    ["Quickaction · best immediate move", scroll.quickaction],
    ["Examiner · hidden assumption", scroll.examiner],
    ["Trigger to reconvene", scroll.triggerToReconvene],
  ];
  return <section className={`scroll ${mode === "reconvening" ? "scroll--prior" : ""}`}>
    <div className="scroll-heading">
      <span className="eyebrow">{mode === "reconvening" ? "Previous verified decision · reconvening" : "Decision scroll"}</span>
      <span className="confidence">{Math.round(scroll.confidence * 100)}% confidence</span>
    </div>
    <h2>{scroll.decision}</h2>
    <p className="scroll-summary">{scroll.rationale}</p>
    <div className="perspective-summaries">
      {entries.slice(1, 4).map(([label, value]) => <article key={label}><strong>{label.split(" · ")[0]}</strong><p>{value}</p></article>)}
    </div>
    <details open={mode === "reconvening" ? false : undefined}>
      <summary>View full Decision Scroll</summary>
      <dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </details>
    {mode === "completed" && <p className="ask-hint">Ask Sutradhara “Why?”, about any council member, or what would change the decision.</p>}
  </section>;
}
