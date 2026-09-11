import { useEffect, useRef, useState } from "react";
import type { AgentCardState, AgentName, CouncilEvent, CouncilPhase, DecisionScroll as DecisionScrollType } from "../shared/schemas";
import { interruptDeliberation, streamDeliberation } from "./api";
import { AgentCard } from "./components/AgentCard";
import { DecisionScroll } from "./components/DecisionScroll";
import { VoiceControl } from "./components/VoiceControl";
import { LiveVoiceSession, type TranscriptSegment } from "./voice/live-session";
import "./styles.css";

const names: AgentName[] = ["forethought", "quickaction", "examiner"];
const freshAgents = (): Record<AgentName, AgentCardState> => ({ forethought: "waiting", quickaction: "waiting", examiner: "waiting" });
const activePhases: CouncilPhase[] = ["routing", "independent", "cross_examining", "synthesizing"];
const progressCopy: Partial<Record<CouncilPhase, string>> = {
  independent: "The three council perspectives are analyzing the decision independently.",
  cross_examining: "The council is now challenging assumptions and disagreements.",
  synthesizing: "The critiques are complete and the Decision Scroll is being synthesized.",
};

export default function App() {
  const [context, setContext] = useState("");
  const [constraint, setConstraint] = useState("");
  const [phase, setPhase] = useState<CouncilPhase>("idle");
  const [agentStates, setAgentStates] = useState(freshAgents);
  const [scroll, setScroll] = useState<DecisionScrollType>();
  const [mode, setMode] = useState<string>();
  const [routeNote, setRouteNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [voiceStatus, setVoiceStatus] = useState<"offline" | "connecting" | "ready" | "talking">("offline");
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const voice = useRef<LiveVoiceSession | undefined>(undefined);
  const delegationId = useRef<string | undefined>(undefined);
  const deliberationId = useRef<string | undefined>(undefined);
  const conversationRevision = useRef(0);
  const deliberationRevision = useRef(0);
  const fetchAbort = useRef<AbortController | undefined>(undefined);
  const phaseRef = useRef<CouncilPhase>(phase);
  const contextRef = useRef(context);
  const scrollRef = useRef(scroll);
  const transcriptRef = useRef<TranscriptSegment[]>(transcript);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { scrollRef.current = scroll; }, [scroll]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => () => voice.current?.close(), []);

  const acceptEvent = (event: CouncilEvent) => {
    if (event.type === "council.phase") {
      setPhase(event.phase);
      if (delegationId.current && ["independent", "cross_examining", "synthesizing"].includes(event.phase)) {
        const progress = progressCopy[event.phase];
        if (progress) voice.current?.appendThinking(progress, delegationId.current);
      }
    } else if (event.type === "agent.state") {
      setAgentStates((current) => ({ ...current, [event.agent]: event.state }));
    } else if (event.type === "router.result") {
      setRouteNote(event.route.reason);
    } else if (event.type === "council.result") {
      setScroll(event.scroll);
      setMode(event.mode);
      if (delegationId.current) {
        const spoken = `Decision: ${event.scroll.decision} Rationale: ${event.scroll.rationale} The main disagreement to explain is: ${event.scroll.examiner} Reconvene when: ${event.scroll.triggerToReconvene}`;
        voice.current?.appendCommentary(spoken, delegationId.current);
        delegationId.current = undefined;
      }
    } else if (event.type === "council.error") {
      setError(event.message);
    } else if (event.type === "council.interrupted") {
      setPhase("interrupted");
    }
  };

  const runCouncil = async (changedConstraint?: string, liveDelegationId?: string) => {
    const voiceContext = transcriptRef.current.map((segment) => `${segment.role}: ${segment.text}`).join(" ").trim();
    const decisionContext = [contextRef.current.trim(), voiceContext].filter(Boolean).join("\nVoice transcript: ");
    if (!decisionContext) { setError("Describe the decision before convening the council."); return; }
    setError(undefined);
    setRouteNote(undefined);
    if (!deliberationId.current) deliberationId.current = crypto.randomUUID();
    conversationRevision.current += 1;
    deliberationRevision.current += 1;
    delegationId.current = liveDelegationId;
    fetchAbort.current = new AbortController();
    if (!scrollRef.current) setAgentStates(freshAgents());
    try {
      await streamDeliberation({
        deliberationId: deliberationId.current,
        conversationRevision: conversationRevision.current,
        deliberationRevision: deliberationRevision.current,
        context: decisionContext,
        changedConstraint: changedConstraint?.trim() || undefined,
        previousScroll: scrollRef.current,
      }, acceptEvent, fetchAbort.current.signal);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Council request failed.");
    }
  };

  const reconvene = async () => {
    if (!constraint.trim()) { setError("State the changed constraint before reconvening."); return; }
    if (deliberationId.current && activePhases.includes(phaseRef.current)) {
      const next = conversationRevision.current + 1;
      await interruptDeliberation(deliberationId.current, next);
      fetchAbort.current?.abort();
      conversationRevision.current = next - 1;
      setPhase("interrupted");
    }
    const changed = constraint;
    setContext((current) => `${current}\nChanged constraint: ${changed}`.trim());
    contextRef.current = `${contextRef.current}\nChanged constraint: ${changed}`.trim();
    setConstraint("");
    await runCouncil(changed);
  };

  const connectVoice = async () => {
    setVoiceStatus("connecting");
    setError(undefined);
    const session = new LiveVoiceSession();
    voice.current = session;
    session.addEventListener("ready", () => setVoiceStatus("ready"));
    session.addEventListener("talking", (event) => setVoiceStatus((event as CustomEvent<boolean>).detail ? "talking" : "ready"));
    session.addEventListener("transcript", (event) => {
      const segment = (event as CustomEvent<TranscriptSegment>).detail;
      setTranscript((current) => {
        const next = [...current.slice(-80), segment];
        transcriptRef.current = next;
        return next;
      });
      if (segment.role === "user" && activePhases.includes(phaseRef.current) && deliberationId.current) {
        const next = conversationRevision.current + 1;
        void interruptDeliberation(deliberationId.current, next);
        conversationRevision.current = next;
        fetchAbort.current?.abort();
        setPhase("interrupted");
      }
    });
    session.addEventListener("delegation", (event) => {
      const id = (event as CustomEvent<string>).detail;
      void runCouncil(undefined, id);
    });
    try { await session.connect(); } catch (caught) {
      setVoiceStatus("offline");
      setError(caught instanceof Error ? caught.message : "Voice connection failed.");
      session.close();
    }
  };

  return <main>
    <header>
      <div>
        <span className="eyebrow">A Panchatantra-inspired AI decision council</span>
        <h1>Sagacity <em>Syndicate</em></h1>
      </div>
      <span className={`phase phase--${phase}`}>{phase.replace("_", " ")}</span>
    </header>

    <section className="workspace">
      <div className="conversation-panel">
        <VoiceControl status={voiceStatus} onConnect={connectVoice} onTalk={(active) => voice.current?.setTalking(active)} />
        <div className="transcript">
          <div className="section-title"><span>Live transcript</span><small>{transcript.length ? "voice session" : "text-first mode"}</small></div>
          {transcript.length ? transcript.map((segment, index) => <p key={`${segment.startMs}-${index}`}><strong>{segment.role === "user" ? "You" : "Sutradhara"}</strong>{segment.text}</p>) : <p className="muted">Your conversation with Sutradhara will appear here.</p>}
        </div>
        <label className="decision-input">
          <span>Decision context</span>
          <textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="What are you deciding? Include your objective, hard constraints, and time horizon." />
        </label>
        {!scroll && <button className="primary" onClick={() => void runCouncil()} disabled={activePhases.includes(phase)}>Convene the council</button>}
        {scroll && <div className="reconvene">
          <label><span>What changed?</span><input value={constraint} onChange={(event) => setConstraint(event.target.value)} placeholder="Add or revise one material constraint" /></label>
          <button className="primary" onClick={() => void reconvene()}>Reconvene</button>
        </div>}
        {routeNote && <p className="route-note"><strong>Impact Router:</strong> {routeNote}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="council-panel">
        <div className="section-title"><span>The council</span><small>{mode ? `${mode} round` : "three independent lenses"}</small></div>
        <div className="agent-list">{names.map((agent) => <AgentCard key={agent} agent={agent} state={agentStates[agent]} />)}</div>
        <DecisionScroll scroll={scroll} />
      </div>
    </section>
    <footer>Advice, not authority · Logs stay local · Revisions {conversationRevision.current}/{deliberationRevision.current}</footer>
  </main>;
}
