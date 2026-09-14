import type { AgentCardState, AgentName, LiveDiagnosticEvent } from "../../shared/schemas.js";

export type LocalDiagnostic = LiveDiagnosticEvent & { at: string };

export function DiagnosticsDrawer({
  events,
  phase,
  productMode,
  roundMode,
  conversationRevision,
  deliberationRevision,
  deliberationId,
  agentStates,
}: {
  events: LocalDiagnostic[];
  phase: string;
  productMode: string;
  roundMode?: string;
  conversationRevision: number;
  deliberationRevision: number;
  deliberationId?: string;
  agentStates: Record<AgentName, AgentCardState>;
}) {
  return <details className="diagnostics">
    <summary>Diagnostics</summary>
    <div className="diagnostics-grid">
      <span><small>Mode</small>{productMode}</span>
      <span><small>Phase</small>{phase}</span>
      <span><small>Round</small>{roundMode ?? "not started"}</span>
      <span><small>Revisions</small>{conversationRevision}/{deliberationRevision}</span>
      <span><small>Agents</small>{Object.entries(agentStates).map(([agent, state]) => `${agent[0].toUpperCase()}:${state}`).join(" · ")}</span>
      <span><small>Council ID</small>{deliberationId ? `${deliberationId.slice(0, 8)}…` : "none"}</span>
    </div>
    <div className="diagnostic-events">
      {events.length ? [...events].reverse().slice(0, 16).map((event, index) => <p key={`${event.at}:${event.event}:${index}`}>
        <time>{new Date(event.at).toLocaleTimeString()}</time><strong>{event.event}</strong>
        {(event.conversationRevision !== undefined || event.deliberationRevision !== undefined) && <span>r{event.conversationRevision ?? "–"}/{event.deliberationRevision ?? "–"}</span>}
      </p>) : <p className="workspace-note">Events for this browser session will appear here. Detailed structured logs remain server-local.</p>}
    </div>
  </details>;
}
