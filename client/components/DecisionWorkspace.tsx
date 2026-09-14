import type { DecisionHistoryEntry } from "../persisted-decision.js";
import { compareDecisionScrolls, downloadDecisionMarkdown } from "../decision-artifacts.js";

export function DecisionWorkspace({
  entries,
  currentDeliberationId,
  onClear,
}: {
  entries: DecisionHistoryEntry[];
  currentDeliberationId?: string;
  onClear: () => void;
}) {
  if (!entries.length) return null;
  const currentEntries = entries.filter((entry) => entry.deliberationId === currentDeliberationId);
  const initial = currentEntries[0];
  const revised = currentEntries.at(-1);
  const comparison = initial && revised && initial.deliberationRevision !== revised.deliberationRevision
    ? compareDecisionScrolls(initial.scroll, revised.scroll)
    : [];

  return <section className="decision-workspace" aria-label="Decision history and exports">
    <div className="decision-workspace__heading">
      <div><span className="eyebrow">Decision workspace</span><h3>Saved locally</h3></div>
      <button className="quiet-button" onClick={onClear} disabled={entries.length < 2}>Clear older history</button>
    </div>

    {revised && <div className="artifact-actions">
      <button className="artifact-button" onClick={() => downloadDecisionMarkdown(revised)}>Export current as Markdown</button>
      <small>{entries.length} of 10 local decisions retained</small>
    </div>}

    <details className="comparison" open={comparison.length > 0}>
      <summary>Initial versus revised decision</summary>
      {comparison.length ? <div className="comparison-grid">
        {comparison.map((row) => <article className={row.changed ? "comparison-row comparison-row--changed" : "comparison-row"} key={row.field}>
          <header><strong>{row.label}</strong><span>{row.changed ? "Changed" : "Unchanged"}</span></header>
          <div><small>Initial</small><p>{row.initial}</p></div>
          <div><small>Latest</small><p>{row.revised}</p></div>
        </article>)}
      </div> : <p className="workspace-note">A field-by-field comparison will appear after this decision is reconvened.</p>}
    </details>

    <details className="history-list">
      <summary>Local decision history ({entries.length})</summary>
      <div>
        {[...entries].reverse().map((entry) => <article key={`${entry.deliberationId}:${entry.deliberationRevision}`}>
          <div><strong>{entry.scroll.decision}</strong><small>{new Date(entry.savedAt).toLocaleString()} · {entry.roundMode} · {Math.round(entry.scroll.confidence * 100)}%</small></div>
          <button className="quiet-button" onClick={() => downloadDecisionMarkdown(entry)}>Export</button>
        </article>)}
      </div>
    </details>
  </section>;
}
