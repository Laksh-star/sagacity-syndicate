import { useEffect, useRef, useState } from "react";
import type {
  AgentCardState, AgentName, CouncilEvent, CouncilPhase, DecisionScroll as DecisionScrollType,
  LiveDiagnosticEvent, VoiceInterruptionAssessment,
} from "../shared/schemas";
import { createCouncilThinkingContext, createVoiceBrief, createVoiceCommentary } from "../shared/voice";
import { classifyLocalVoiceIntent, interruptionAction, obviousNonMaterialAssessment } from "../shared/voice-policy";
import { assessVoiceInterruption, interruptDeliberation, recordLiveDiagnostic, streamDeliberation } from "./api";
import { AgentCard } from "./components/AgentCard";
import { DecisionScroll } from "./components/DecisionScroll";
import { VoiceControl } from "./components/VoiceControl";
import { VoiceCouncilLifecycle, type CouncilRevision } from "./voice/council-lifecycle";
import { LiveVoiceSession, type LiveDelegation, type VoiceTurn } from "./voice/live-session";
import "./styles.css";

const names: AgentName[] = ["forethought", "quickaction", "examiner"];
const freshAgents = (): Record<AgentName, AgentCardState> => ({ forethought: "waiting", quickaction: "waiting", examiner: "waiting" });
const activePhases: CouncilPhase[] = ["routing", "independent", "cross_examining", "synthesizing"];
type ProductMode = "conversation" | "deliberating" | "completed" | "reconvening";

function transcriptContext(turns: VoiceTurn[]): string {
  return turns.filter((turn) => turn.complete && turn.text.trim()).slice(-12)
    .map((turn) => `${turn.role === "user" ? "User" : "Sutradhara"}: ${turn.text.trim()}`).join("\n");
}

export default function App() {
  const [context, setContext] = useState("");
  const [constraint, setConstraint] = useState("");
  const [phase, setPhase] = useState<CouncilPhase>("idle");
  const [productMode, setProductMode] = useState<ProductMode>("conversation");
  const [agentStates, setAgentStates] = useState(freshAgents);
  const [scroll, setScroll] = useState<DecisionScrollType>();
  const [roundMode, setRoundMode] = useState<string>();
  const [routeNote, setRouteNote] = useState<string>();
  const [changedFact, setChangedFact] = useState<string>();
  const [error, setError] = useState<string>();
  const [voiceStatus, setVoiceStatus] = useState<"offline" | "connecting" | "ready" | "talking">("offline");
  const [transcript, setTranscript] = useState<VoiceTurn[]>([]);
  const voice = useRef<LiveVoiceSession | undefined>(undefined);
  const lifecycle = useRef(new VoiceCouncilLifecycle());
  const deliberationId = useRef<string | undefined>(undefined);
  const conversationRevision = useRef(0);
  const deliberationRevision = useRef(0);
  const fetchAbort = useRef<AbortController | undefined>(undefined);
  const contextRef = useRef(context);
  const scrollRef = useRef(scroll);
  const transcriptRef = useRef(transcript);
  const processedTurns = useRef(new Set<string>());
  const revisionedTurns = useRef(new Set<string>());
  const activeDelegation = useRef<string | null>(null);
  const progressSent = useRef(false);

  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { scrollRef.current = scroll; }, [scroll]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => () => voice.current?.close(), []);

  const diagnostic = (entry: LiveDiagnosticEvent) => recordLiveDiagnostic(entry);

  const speak = (content: string, delegationId: string | null, event: "live.thinking.sent" | "live.commentary.sent", revision?: CouncilRevision) => {
    if (!voice.current || !delegationId) return;
    try {
      if (event === "live.thinking.sent") voice.current.appendThinking(content, delegationId);
      else voice.current.appendCommentary(content, delegationId);
      diagnostic({ event, delegationId: delegationId ?? undefined, ...revision, detail: `characters=${content.length}` });
    } catch (caught) {
      diagnostic({ event: "live.error", detail: caught instanceof Error ? caught.message : "Could not append to GPT-Live." });
    }
  };

  const noteConversationTurn = (turnId: string) => {
    if (revisionedTurns.current.has(turnId)) return;
    revisionedTurns.current.add(turnId);
    conversationRevision.current += 1;
  };

  const runCouncil = async (options: { changedConstraint?: string; delegation?: LiveDelegation; reconvening?: boolean; conversationChanged?: boolean } = {}) => {
    const voiceContext = transcriptContext(transcriptRef.current);
    const decisionContext = [contextRef.current.trim(), voiceContext && `Voice conversation:\n${voiceContext}`].filter(Boolean).join("\n\n");
    if (!decisionContext) { setError("Describe the decision before convening the council."); return; }

    setError(undefined);
    setRouteNote(undefined);
    if (!deliberationId.current) deliberationId.current = crypto.randomUUID();
    if (options.conversationChanged !== false) conversationRevision.current += 1;
    deliberationRevision.current += 1;
    const revision = { conversationRevision: conversationRevision.current, deliberationRevision: deliberationRevision.current };
    const delegationId = options.delegation?.id ?? null;
    activeDelegation.current = delegationId;
    lifecycle.current.startRound({ ...revision, delegationId, causalTurnId: options.delegation?.causalTurnId, reconvening: Boolean(options.reconvening) });
    fetchAbort.current = new AbortController();
    progressSent.current = false;
    setProductMode(options.reconvening ? "reconvening" : "deliberating");
    setPhase("routing");
    setAgentStates(freshAgents());
    diagnostic({ event: "live.delegation.bound_to_revision", delegationId: delegationId ?? undefined, ...revision, detail: `causalTurn=${options.delegation?.causalTurnId ?? "text"}` });
    diagnostic({ event: "council.started", delegationId: delegationId ?? undefined, ...revision, detail: options.reconvening ? "reconvening" : "initial" });

    const acceptEvent = (event: CouncilEvent) => {
      if (!lifecycle.current.isCurrent(revision)) {
        if (event.type === "council.result") diagnostic({ event: "council.stale_result.discarded", ...revision });
        return;
      }
      if (event.type === "council.phase") {
        setPhase(event.phase);
        diagnostic({ event: "council.phase", ...revision, detail: event.phase });
        const boundDelegation = lifecycle.current.activeRound()?.delegationId ?? delegationId;
        if (event.phase === "cross_examining" && !progressSent.current && boundDelegation) {
          progressSent.current = true;
          speak("The independent views are complete and the council is now challenging assumptions. Do not suggest any conclusion yet.", boundDelegation, "live.commentary.sent", revision);
        }
      } else if (event.type === "agent.state") {
        setAgentStates((current) => ({ ...current, [event.agent]: event.state }));
      } else if (event.type === "router.result") {
        setRouteNote(event.route.reason);
      } else if (event.type === "council.result") {
        const resultDelegation = lifecycle.current.activeRound()?.delegationId ?? delegationId;
        if (!lifecycle.current.acceptResult(revision, event.scroll)) {
          diagnostic({ event: "council.stale_result.discarded", ...revision });
          return;
        }
        scrollRef.current = event.scroll;
        setScroll(event.scroll);
        setRoundMode(event.mode);
        setProductMode("completed");
        setPhase("completed");
        setChangedFact(undefined);
        diagnostic({ event: "council.completed", delegationId: delegationId ?? undefined, ...revision, detail: `mode=${event.mode}` });
        if (resultDelegation && voice.current) {
          speak(createCouncilThinkingContext(event.scroll), resultDelegation, "live.thinking.sent", revision);
          speak(createVoiceCommentary(createVoiceBrief(event.scroll)), resultDelegation, "live.commentary.sent", revision);
        }
        activeDelegation.current = null;
      } else if (event.type === "council.error") {
        lifecycle.current.endIfCurrent(revision);
        setPhase("failed");
        setProductMode(scrollRef.current ? "completed" : "conversation");
        setError(event.message);
      } else if (event.type === "council.interrupted") {
        setPhase("interrupted");
      }
    };

    try {
      await streamDeliberation({
        deliberationId: deliberationId.current,
        ...revision,
        context: decisionContext,
        changedConstraint: options.changedConstraint?.trim() || undefined,
        previousScroll: scrollRef.current,
      }, acceptEvent, fetchAbort.current.signal);
    } catch (caught) {
      if (lifecycle.current.isCurrent(revision) && !(caught instanceof DOMException && caught.name === "AbortError")) {
        lifecycle.current.endIfCurrent(revision);
        setPhase("failed");
        setProductMode(scrollRef.current ? "completed" : "conversation");
        setError(caught instanceof Error ? caught.message : "Council request failed.");
      }
    }
  };

  const reconveneWithConstraint = async (changedConstraint: string, delegation?: LiveDelegation, conversationAlreadyAdvanced = false) => {
    const changed = changedConstraint.trim();
    if (!changed) return;
    setChangedFact(changed);
    const active = lifecycle.current.activeRound();
    if (active && deliberationId.current) {
      diagnostic({
        event: "council.cancel.requested",
        conversationRevision: active.conversationRevision,
        deliberationRevision: active.deliberationRevision,
        delegationId: active.delegationId ?? undefined,
        detail: changed.slice(0, 500),
      });
      await interruptDeliberation(deliberationId.current, conversationRevision.current + (conversationAlreadyAdvanced ? 0 : 1)).catch(() => undefined);
      fetchAbort.current?.abort();
    }
    const nextContext = `${contextRef.current}\nChanged constraint: ${changed}`.trim();
    contextRef.current = nextContext;
    setContext(nextContext);
    setConstraint("");
    await runCouncil({ changedConstraint: changed, delegation, reconvening: true, conversationChanged: !conversationAlreadyAdvanced });
  };

  const processCompletedUserTurn = async (turn: VoiceTurn, delegation?: LiveDelegation) => {
    if (!turn.text.trim()) return;
    noteConversationTurn(turn.id);
    if (processedTurns.current.has(turn.id)) {
      if (delegation && lifecycle.current.bindDelegation(delegation.id, turn.id)) {
        const bound = lifecycle.current.activeRound();
        diagnostic({
          event: "live.delegation.bound_to_revision",
          delegationId: delegation.id,
          conversationRevision: bound?.conversationRevision,
          deliberationRevision: bound?.deliberationRevision,
          detail: `late causalTurn=${turn.id}`,
        });
      }
      return;
    }
    if (lifecycle.current.isCausalTurn(turn.id)) return;
    const active = lifecycle.current.activeRound();
    const hasDecision = Boolean(scrollRef.current);
    if (!active && !hasDecision && delegation) {
      processedTurns.current.add(turn.id);
      await runCouncil({ delegation, conversationChanged: false });
      return;
    }
    if (!active && !hasDecision) return;
    processedTurns.current.add(turn.id);

    diagnostic({ event: "live.interruption.received", delegationId: delegation?.id, detail: `characters=${turn.text.length}` });
    let assessment: VoiceInterruptionAssessment;
    try {
      assessment = obviousNonMaterialAssessment(turn.text, hasDecision) ?? await assessVoiceInterruption({
        utterance: turn.text,
        currentContext: contextRef.current || "Voice-provided decision context.",
        phase: active ? "deliberating" : "completed",
        currentScroll: scrollRef.current,
      });
    } catch {
      assessment = { material: false, reason: "The change is ambiguous, so current work is preserved pending clarification.", confidence: 0 };
    }
    diagnostic({ event: "live.interruption.materiality", delegationId: delegation?.id, detail: `${assessment.material}:${assessment.confidence}:${assessment.reason}`.slice(0, 500) });
    const action = interruptionAction(assessment);
    if (action === "reconvene" && assessment.changedConstraint) {
      await reconveneWithConstraint(assessment.changedConstraint, delegation, true);
      return;
    }
    if (action === "clarify") {
      const id = delegation?.id ?? activeDelegation.current;
      if (id) speak("Ask one brief question to confirm whether the user's latest statement changes a decision constraint. Preserve the current council work until they confirm.", id, "live.commentary.sent");
      return;
    }
    if (active) {
      const intent = classifyLocalVoiceIntent(turn.text, hasDecision);
      if (intent === "status") {
        const id = delegation?.id ?? active.delegationId;
        if (id) speak("Answer the user's process question briefly. The council is still working; do not invent findings or imply synthesis is complete.", id, "live.commentary.sent", active);
      }
      return;
    }
    if (scrollRef.current) {
      if (delegation) {
        speak(createCouncilThinkingContext(scrollRef.current), delegation.id, "live.thinking.sent");
        speak(`Answer the user's question conversationally from the verified council context just provided. User asked: ${turn.text.slice(0, 500)} Do not reconvene or invent new analysis.`, delegation.id, "live.commentary.sent");
      }
    }
  };

  const manualReconvene = async () => {
    if (!constraint.trim()) { setError("State the changed constraint before reconvening."); return; }
    await reconveneWithConstraint(constraint);
  };

  const connectVoice = async () => {
    setVoiceStatus("connecting");
    setError(undefined);
    const session = new LiveVoiceSession();
    voice.current = session;
    session.addEventListener("ready", () => setVoiceStatus("ready"));
    session.addEventListener("closed", () => setVoiceStatus("offline"));
    session.addEventListener("talking", (event) => setVoiceStatus((event as CustomEvent<boolean>).detail ? "talking" : "ready"));
    session.addEventListener("turn", (event) => {
      const turn = (event as CustomEvent<VoiceTurn>).detail;
      setTranscript((current) => {
        const existing = current.findIndex((item) => item.id === turn.id);
        const next = existing >= 0 ? current.map((item) => item.id === turn.id ? turn : item) : [...current, turn].slice(-20);
        transcriptRef.current = next;
        return next;
      });
    });
    session.addEventListener("turn.completed", (event) => {
      const turn = (event as CustomEvent<VoiceTurn>).detail;
      if (turn.role === "user") void processCompletedUserTurn(turn);
    });
    session.addEventListener("delegation", (event) => {
      const delegation = (event as CustomEvent<LiveDelegation>).detail;
      if (delegation.causalTurn) void processCompletedUserTurn(delegation.causalTurn, delegation);
    });
    session.addEventListener("diagnostic", (event) => diagnostic((event as CustomEvent<LiveDiagnosticEvent>).detail));
    session.addEventListener("append.acknowledged", (event) => {
      const detail = (event as CustomEvent<{ kind: "thinking" | "commentary" }>).detail;
      diagnostic({ event: detail.kind === "thinking" ? "live.thinking.acknowledged" : "live.commentary.acknowledged" });
    });
    session.addEventListener("live.error", (event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      diagnostic({ event: "live.error", detail: detail.message.slice(0, 500) });
      setError(`Voice session: ${detail.message}`);
    });
    try { await session.connect(); } catch (caught) {
      diagnostic({ event: "live.error", detail: (caught instanceof Error ? caught.message : "Voice connection failed.").slice(0, 500) });
      setVoiceStatus("offline");
      setError(caught instanceof Error ? caught.message : "Voice connection failed.");
      session.close();
    }
  };

  const visiblePhase = productMode === "reconvening" ? "reconvening" : productMode === "deliberating" ? "deliberating" : productMode;
  return <main className={`mode-${productMode}`}>
    <header>
      <div><span className="eyebrow">A Panchatantra-inspired AI decision council</span><h1>Sagacity <em>Syndicate</em></h1></div>
      <span className={`phase phase--${visiblePhase}`}>{visiblePhase}</span>
    </header>

    {productMode === "deliberating" || productMode === "reconvening" ? <section className="council-status">
      <span className="eyebrow">{productMode === "reconvening" ? "New constraint received" : "Council session"}</span>
      <h2>{productMode === "reconvening" ? "Reconvening council" : "The council is deliberating"}</h2>
      <p>{productMode === "reconvening" ? changedFact : `Current phase: ${phase.replace("_", " ")}`}</p>
    </section> : null}

    <section className="workspace">
      <div className="conversation-panel">
        <VoiceControl status={voiceStatus} productMode={productMode} onConnect={connectVoice} onTalk={(active) => voice.current?.setTalking(active)} />
        <div className="transcript">
          <div className="section-title"><span>Conversation</span><small>{transcript.length ? "bounded turn history" : "text-first mode"}</small></div>
          {transcript.length ? transcript.slice(-8).map((turn) => <p className={turn.complete ? "" : "transcript-partial"} key={turn.id}><strong>{turn.role === "user" ? "You" : "Sutradhara"}</strong><span>{turn.text || "Listening…"}</span></p>) : <p className="muted">Your conversation with Sutradhara will appear here.</p>}
        </div>
        <label className="decision-input"><span>Decision context</span><textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="What are you deciding? Include your objective, hard constraints, and time horizon." /></label>
        {!scroll && <button className="primary" onClick={() => void runCouncil()} disabled={activePhases.includes(phase)}>Convene the council</button>}
        {scroll && <div className="reconvene">
          <label><span>What materially changed?</span><input value={constraint} onChange={(event) => setConstraint(event.target.value)} placeholder="Add or revise one material constraint" /></label>
          <button className="primary" onClick={() => void manualReconvene()}>Reconvene</button>
        </div>}
        {routeNote && <p className="route-note"><strong>Impact Router:</strong> {routeNote}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="council-panel">
        <div className="section-title"><span>The council</span><small>{roundMode ? `${roundMode} round` : "three independent lenses"}</small></div>
        <div className="agent-list">{names.map((agent) => <AgentCard key={agent} agent={agent} state={agentStates[agent]} />)}</div>
        <DecisionScroll scroll={scroll} mode={productMode} />
      </div>
    </section>
    <footer><span>Advice, not authority · Logs stay local</span><span>Revisions {conversationRevision.current}/{deliberationRevision.current}</span></footer>
  </main>;
}
