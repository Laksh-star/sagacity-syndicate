import type { DecisionScroll as DecisionScrollType } from "../../shared/schemas";

export function DecisionScroll({ scroll }: { scroll?: DecisionScrollType }) {
  if (!scroll) return <section className="scroll scroll--empty">
    <span className="eyebrow">Decision scroll</span>
    <h2>The council has not convened yet.</h2>
    <p>Give Sutradhara the decision, your objective, hard constraints, and time horizon.</p>
  </section>;
  const entries = [
    ["Rationale", scroll.rationale],
    ["Forethought · biggest future risk", scroll.forethought],
    ["Quickaction · best immediate move", scroll.quickaction],
    ["Examiner · hidden assumption", scroll.examiner],
    ["Trigger to reconvene", scroll.triggerToReconvene],
  ];
  return <section className="scroll">
    <div className="scroll-heading">
      <span className="eyebrow">Decision scroll</span>
      <span className="confidence">{Math.round(scroll.confidence * 100)}% confidence</span>
    </div>
    <h2>{scroll.decision}</h2>
    <dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}
