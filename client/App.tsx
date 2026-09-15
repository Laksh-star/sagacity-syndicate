import { useEffect, useRef, useState } from "react";
import type {
  AgentCardState, AgentName, CouncilEvent, CouncilPhase, CouncilTrace, DecisionScroll as DecisionScrollType,
  LiveDiagnosticEvent, VoiceInterruptionAssessment,
} from "../shared/schemas";
import { createCouncilThinkingContext, createVoiceBrief, createVoiceCommentary } from "../shared/voice";
import { classifyLocalVoiceIntent, interruptionAction, obviousMaterialAssessment, obviousNonMaterialAssessment } from "../shared/voice-policy";
import { assessVoiceInterruption, assessVoiceReadiness, interruptDeliberation, recordLiveDiagnostic, streamDeliberation } from "./api";
import { AgentCard } from "./components/AgentCard";
import { CouncilMap } from "./components/CouncilMap";
import { DecisionScroll } from "./components/DecisionScroll";
import { DecisionWorkspace } from "./components/DecisionWorkspace";
import { DiagnosticsDrawer, type LocalDiagnostic } from "./components/DiagnosticsDrawer";
import { VoiceControl } from "./components/VoiceControl";
import { createTypedCorrectionTurn } from "./decision-artifacts";
import { clearDecisionHistory, clearPersistedDecision, loadDecisionHistory, loadPersistedDecision, persistDecision, recordDecisionHistory, reconveningDecisionContext, restoredDecisionContext, type DecisionHistoryEntry } from "./persisted-decision";
import { VoiceCouncilLifecycle, type CouncilRevision } from "./voice/council-lifecycle";
import { LiveAppendTracker, type LiveAppendKind } from "./voice/append-tracker";
import { InitialHandoffGate, VoiceDelegationCoordinator } from "./voice/delegation-coordinator";
import { buildVoiceDecisionContext } from "./voice/decision-context";
import { LiveVoiceSession, type LiveDelegation, type VoiceTurn } from "./voice/live-session";
import type { LivePlaybackState } from "./voice/playback-controller";
import { SerialTaskQueue } from "./voice/serial-task-queue";
import { createLiveSessionBootstrap } from "./voice/session-bootstrap";
import { isNearTranscriptEnd, scrollTranscriptToLatest } from "./voice/transcript-scroll";
import "./styles.css";

const names: AgentName[] = ["forethought", "quickaction", "examiner"];
const freshAgents = (): Record<AgentName, AgentCardState> => ({ forethought: "waiting", quickaction: "waiting", examiner: "waiting" });
const activePhases: CouncilPhase[] = ["routing", "independent", "cross_examining", "synthesizing"];
type ProductMode = "conversation" | "deliberating" | "completed" | "reconvening";
type InputMode = "voice" | "text";
type VoiceIntakeStage = "ready" | "listening" | "captured" | "clarifying" | "preparing";

const emptyCopy: Record<VoiceIntakeStage, { title: string; description: string }> = {
  ready: { title: "Ready when you are.", description: "Speak with Sutradhara, or switch to text to write the decision." },
  listening: { title: "Listening to your decision.", description: "Release the voice control when you finish this turn." },
  captured: { title: "Decision captured.", description: "Sutradhara is checking whether one essential detail is still needed." },
  clarifying: { title: "One detail may still be needed.", description: "Answer Sutradhara's brief clarification, then the council will begin automatically." },
  preparing: { title: "Preparing the council.", description: "The application is handing the completed decision to the council." },
};

export default function App() {
  const [restored] = useState(() => loadPersistedDecision());
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEntry[]>(() => loadDecisionHistory());
  const [context, setContext] = useState("");
  const [constraint, setConstraint] = useState("");
  const [phase, setPhase] = useState<CouncilPhase>(restored ? "completed" : "idle");
  const [productMode, setProductMode] = useState<ProductMode>(restored ? "completed" : "conversation");
  const [agentStates, setAgentStates] = useState<Record<AgentName, AgentCardState>>(
    restored ? { forethought: "done", quickaction: "done", examiner: "done" } : freshAgents,
  );
  const [scroll, setScroll] = useState<DecisionScrollType | undefined>(restored?.scroll);
  const [councilTrace, setCouncilTrace] = useState<CouncilTrace | undefined>(restored?.trace);
  const [roundMode, setRoundMode] = useState<string | undefined>(restored?.roundMode);
  const [routeNote, setRouteNote] = useState<string>();
  const [changedFact, setChangedFact] = useState<string>();
  const [error, setError] = useState<string>();
  const [voiceStatus, setVoiceStatus] = useState<"offline" | "connecting" | "ready" | "talking">("offline");
  const [playbackState, setPlaybackState] = useState<LivePlaybackState>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [voiceIntakeStage, setVoiceIntakeStage] = useState<VoiceIntakeStage>("ready");
  const [transcript, setTranscript] = useState<VoiceTurn[]>([]);
  const [transcriptAtLatest, setTranscriptAtLatest] = useState(true);
  const [diagnostics, setDiagnostics] = useState<LocalDiagnostic[]>([]);
  const voice = useRef<LiveVoiceSession | undefined>(undefined);
  const lifecycle = useRef(new VoiceCouncilLifecycle());
  const deliberationId = useRef<string | undefined>(restored?.deliberationId);
  const conversationRevision = useRef(restored?.conversationRevision ?? 0);
  const deliberationRevision = useRef(restored?.deliberationRevision ?? 0);
  const fetchAbort = useRef<AbortController | undefined>(undefined);
  const contextRef = useRef(context);
  const scrollRef = useRef(scroll);
  const councilTraceRef = useRef(councilTrace);
  const transcriptRef = useRef(transcript);
  const productModeRef = useRef(productMode);
  const processedTurns = useRef(new Set<string>());
  const revisionedTurns = useRef(new Set<string>());
  const activeDelegation = useRef<string | null>(null);
  const progressSent = useRef(false);
  const readinessTurns = useRef(new Set<string>());
  const fallbackTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const initialHandoffGate = useRef(new InitialHandoffGate());
  const delegationCoordinator = useRef(new VoiceDelegationCoordinator());
  const appendTracker = useRef(new LiveAppendTracker());
  const transcriptElement = useRef<HTMLDivElement | null>(null);
  const completedTurnQueue = useRef(new SerialTaskQueue());
  const restoredLifecycle = useRef(false);

  if (restored && !restoredLifecycle.current) {
    lifecycle.current.restoreVerifiedResult({
      conversationRevision: restored.conversationRevision,
      deliberationRevision: restored.deliberationRevision,
    }, restored.scroll);
    restoredLifecycle.current = true;
  }

  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { scrollRef.current = scroll; }, [scroll]);
  useEffect(() => { councilTraceRef.current = councilTrace; }, [councilTrace]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { productModeRef.current = productMode; }, [productMode]);
  useEffect(() => () => {
    fallbackTimers.current.forEach(clearTimeout);
    voice.current?.close();
  }, []);

  useEffect(() => {
    if (!transcriptAtLatest || !transcriptElement.current) return;
    scrollTranscriptToLatest(transcriptElement.current);
  }, [transcript, transcriptAtLatest]);

  const diagnostic = (entry: LiveDiagnosticEvent) => {
    const local = { ...entry, at: new Date().toISOString() };
    setDiagnostics((current) => [...current, local].slice(-40));
    recordLiveDiagnostic(entry);
  };

  const appendLive = (content: string, delegationId: string | null, kind: LiveAppendKind, revision?: CouncilRevision) => {
    if (!voice.current) return;
    try {
      const eventId = kind === "thinking"
        ? voice.current.appendThinking(content, delegationId)
        : kind === "commentary"
          ? voice.current.appendCommentary(content, delegationId)
          : voice.current.appendInstructions(content, delegationId);
      appendTracker.current.register(eventId, { kind, revision, delegationId });
      diagnostic({ event: `live.${kind}.sent` as LiveDiagnosticEvent["event"], delegationId: delegationId ?? undefined, ...revision, detail: `event=${eventId}; characters=${content.length}` });
    } catch (caught) {
      diagnostic({ event: "live.error", detail: caught instanceof Error ? caught.message : "Could not append to GPT-Live." });
    }
  };

  const setAuthoritativeLiveStatus = (status: "NOT_STARTED" | "CLARIFYING" | "ACTIVE" | "COMPLETED" | "FAILED", detail: string, delegationId: string | null = null, revision?: CouncilRevision) => {
    appendLive(`Authoritative council status: ${status}. ${detail} Do not claim any other council status until the application sends a newer authoritative status.`, delegationId, "instructions", revision);
  };

  const noteConversationTurn = (turnId: string) => {
    if (revisionedTurns.current.has(turnId)) return;
    revisionedTurns.current.add(turnId);
    conversationRevision.current += 1;
  };

  const runCouncil = async (options: { changedConstraint?: string; delegation?: LiveDelegation; reconvening?: boolean; conversationChanged?: boolean } = {}) => {
    const currentDecisionContext = buildVoiceDecisionContext(
      contextRef.current,
      transcriptRef.current,
      options.delegation?.causalTurn,
    );
    const decisionContext = options.reconvening && scrollRef.current
      ? reconveningDecisionContext(scrollRef.current, currentDecisionContext)
      : currentDecisionContext || (scrollRef.current ? restoredDecisionContext(scrollRef.current) : "");
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
    setVoiceIntakeStage("preparing");
    setPhase("routing");
    setAgentStates(freshAgents());
    diagnostic({ event: "live.delegation.bound_to_revision", delegationId: delegationId ?? undefined, ...revision, detail: `causalTurn=${options.delegation?.causalTurnId ?? "text"}` });
    diagnostic({ event: "council.started", delegationId: delegationId ?? undefined, ...revision, detail: options.reconvening ? "reconvening" : "initial" });
    setAuthoritativeLiveStatus("ACTIVE", "The council has actually started. You may acknowledge this briefly. Do not state findings before verified synthesis arrives.", delegationId, revision);

    const acceptEvent = (event: CouncilEvent) => {
      if (!lifecycle.current.isCurrent(revision)) {
        if (event.type === "council.result") diagnostic({ event: "council.stale_result.discarded", ...revision });
        return;
      }
      if (event.type === "council.phase") {
        setPhase(event.phase);
        diagnostic({ event: "council.phase", ...revision, detail: event.phase });
        const boundDelegation = lifecycle.current.activeRound()?.delegationId ?? delegationId;
        if (event.phase === "cross_examining" && !progressSent.current) {
          progressSent.current = true;
          appendLive("The independent views are complete and the council is now challenging assumptions. Do not suggest any conclusion yet.", boundDelegation, "commentary", revision);
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
        const acceptedTrace = event.trace ?? councilTraceRef.current;
        councilTraceRef.current = acceptedTrace;
        setCouncilTrace(acceptedTrace);
        setRoundMode(event.mode);
        const decisionRecord = {
          deliberationId: deliberationId.current as string,
          ...revision,
          roundMode: event.mode,
          scroll: event.scroll,
          trace: acceptedTrace,
        } as const;
        persistDecision(decisionRecord);
        setDecisionHistory(recordDecisionHistory(decisionRecord));
        setProductMode("completed");
        setPhase("completed");
        setVoiceIntakeStage("ready");
        setChangedFact(undefined);
        diagnostic({ event: "council.completed", delegationId: delegationId ?? undefined, ...revision, detail: `mode=${event.mode}` });
        if (voice.current) {
          setAuthoritativeLiveStatus("COMPLETED", "Verified synthesis succeeded. The full Decision Scroll is visible. Give only the concise briefing supplied next.", resultDelegation, revision);
          appendLive(createCouncilThinkingContext(event.scroll), resultDelegation, "thinking", revision);
          appendLive(createVoiceCommentary(createVoiceBrief(event.scroll)), resultDelegation, "commentary", revision);
        }
        activeDelegation.current = null;
      } else if (event.type === "council.error") {
        lifecycle.current.endIfCurrent(revision);
        setPhase("failed");
        setProductMode(scrollRef.current ? "completed" : "conversation");
        setError(event.message);
        setAuthoritativeLiveStatus("FAILED", "The council did not complete. Briefly say that the attempt failed; do not invent a result.", lifecycle.current.activeRound()?.delegationId ?? null, revision);
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
        setAuthoritativeLiveStatus("FAILED", "The council did not complete. Briefly say that the attempt failed; do not invent a result.", lifecycle.current.activeRound()?.delegationId ?? null, revision);
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
    const active = lifecycle.current.activeRound();
    const hasDecision = Boolean(scrollRef.current);

    if (!active && !hasDecision && delegation) {
      const replacedTurn = initialHandoffGate.current.replace(turn.id);
      if (replacedTurn && replacedTurn !== turn.id) {
        fallbackTimers.current.forEach(clearTimeout);
        fallbackTimers.current.clear();
      }
      const claim = delegationCoordinator.current.claimNative(turn.id, delegation.id);
      const timer = fallbackTimers.current.get(turn.id);
      if (timer) clearTimeout(timer);
      fallbackTimers.current.delete(turn.id);
      if (claim === "start") {
        processedTurns.current.add(turn.id);
        initialHandoffGate.current.clear(turn.id);
        await runCouncil({ delegation, conversationChanged: false });
      } else if (claim === "bind" && lifecycle.current.bindDelegation(delegation.id, turn.id)) {
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

    if (processedTurns.current.has(turn.id)) {
      if (delegation && lifecycle.current.bindDelegation(delegation.id, turn.id)) {
        const bound = lifecycle.current.activeRound();
        diagnostic({ event: "live.delegation.bound_to_revision", delegationId: delegation.id, conversationRevision: bound?.conversationRevision, deliberationRevision: bound?.deliberationRevision, detail: `late causalTurn=${turn.id}` });
      }
      return;
    }
    if (lifecycle.current.isCausalTurn(turn.id)) return;

    if (!active && !hasDecision) {
      if (readinessTurns.current.has(turn.id)) return;
      readinessTurns.current.add(turn.id);
      setVoiceIntakeStage("captured");
      const completedUserTurns = transcriptRef.current
        .filter((candidate) => candidate.role === "user" && candidate.complete && candidate.text.trim())
        .slice(-8)
        .map((candidate) => candidate.text.trim());
      let readiness;
      try {
        readiness = await assessVoiceReadiness({
          latestTurn: turn.text.trim(),
          currentContext: contextRef.current.trim() || "Voice-only intake; no separate written context was supplied.",
          completedUserTurns: completedUserTurns.length ? completedUserTurns : [turn.text.trim()],
        });
      } catch {
        readiness = turn.text.trim().length >= 80
          ? { action: "convene" as const, missingInformation: [], reason: "The completed voice turn contains enough context for bounded analysis.", confidence: 0.5 }
          : { action: "clarify" as const, missingInformation: ["the decision or choice to examine"], reason: "The decision is not yet clear enough to convene.", confidence: 0.5 };
      }
      // Native delegation may have won while the bounded readiness request was
      // in flight. Its ACTIVE status must not be overwritten by a late
      // clarification result, and it must never be followed by a fallback.
      if (
        delegationCoordinator.current.sourceFor(turn.id)
        || initialHandoffGate.current.isReservedForOther(turn.id)
        || lifecycle.current.activeRound()
        || scrollRef.current
      ) return;
      diagnostic({ event: "live.readiness.assessed", detail: `${readiness.action}:${readiness.confidence}:${readiness.reason}`.slice(0, 500) });
      if (readiness.action === "clarify") {
        processedTurns.current.add(turn.id);
        setVoiceIntakeStage("clarifying");
        setAuthoritativeLiveStatus("CLARIFYING", `The council has not started. Ask one brief question about: ${readiness.missingInformation.join("; ")}.`);
        return;
      }
      if (!initialHandoffGate.current.reserve(turn.id)) return;
      setVoiceIntakeStage("preparing");
      const timer = setTimeout(() => {
        fallbackTimers.current.delete(turn.id);
        if (!initialHandoffGate.current.isCurrent(turn.id) || lifecycle.current.activeRound() || scrollRef.current) return;
        if (!delegationCoordinator.current.claimFallback(turn.id)) return;
        initialHandoffGate.current.clear(turn.id);
        processedTurns.current.add(turn.id);
        diagnostic({ event: "live.delegation.fallback", detail: `causalTurn=${turn.id}; native delegation grace expired` });
        void runCouncil({ conversationChanged: false });
      }, 1_000);
      fallbackTimers.current.set(turn.id, timer);
      return;
    }

    processedTurns.current.add(turn.id);

    diagnostic({ event: "live.interruption.received", delegationId: delegation?.id, detail: `characters=${turn.text.length}` });
    let assessment: VoiceInterruptionAssessment;
    try {
      assessment = obviousNonMaterialAssessment(turn.text, hasDecision)
        ?? obviousMaterialAssessment(turn.text)
        ?? await assessVoiceInterruption({
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
      appendLive("Ask one brief question to confirm whether the user's latest statement changes a decision constraint. Preserve the current council work until they confirm.", id, "commentary");
      return;
    }
    if (active) {
      const intent = classifyLocalVoiceIntent(turn.text, hasDecision);
      if (intent === "status") {
        const id = delegation?.id ?? active.delegationId;
        appendLive("Answer the user's process question briefly. The council is still working; do not invent findings or imply synthesis is complete.", id, "commentary", active);
      }
      return;
    }
    if (scrollRef.current) {
      const id = delegation?.id ?? null;
      appendLive(createCouncilThinkingContext(scrollRef.current), id, "thinking");
      appendLive(`Answer the user's question conversationally from the verified council context just provided. User asked: ${turn.text.slice(0, 500)} Do not reconvene or invent new analysis.`, id, "commentary");
    }
  };

  const manualReconvene = async () => {
    if (!constraint.trim()) { setError("State the changed constraint before reconvening."); return; }
    await reconveneWithConstraint(constraint);
  };

  const submitTypedCorrection = async () => {
    const changed = constraint.trim();
    if (!changed) { setError("State the precise correction before reconvening."); return; }
    const turn = createTypedCorrectionTurn(changed);
    setTranscript((current) => {
      const next = [...current, turn].slice(-20);
      transcriptRef.current = next;
      return next;
    });
    diagnostic({ event: "live.interruption.received", detail: `typed-correction; characters=${changed.length}` });
    diagnostic({ event: "live.interruption.materiality", detail: "true:1:User explicitly submitted a typed material correction." });
    if (voice.current) appendLive(`The user supplied this factual correction in the application: ${changed.slice(0, 400)}. The application is reconvening the council; do not answer from the prior result as if it were current.`, null, "thinking");
    await reconveneWithConstraint(changed);
  };

  const connectVoice = async () => {
    setInputMode("voice");
    setVoiceStatus("connecting");
    setError(undefined);
    const session = new LiveVoiceSession();
    voice.current = session;
    session.addEventListener("ready", () => {
      setVoiceStatus("ready");
      setVoiceIntakeStage("ready");
      const bootstrap = createLiveSessionBootstrap(scrollRef.current);
      const verifiedRevision = lifecycle.current.verifiedResult()?.revision;
      if (bootstrap.thinkingContext) appendLive(bootstrap.thinkingContext, null, "thinking", verifiedRevision);
      setAuthoritativeLiveStatus(bootstrap.status, bootstrap.statusDetail, null, verifiedRevision);
    });
    session.addEventListener("closed", () => { setVoiceStatus("offline"); setPlaybackState("idle"); });
    session.addEventListener("talking", (event) => {
      const talking = (event as CustomEvent<boolean>).detail;
      setVoiceStatus(talking ? "talking" : "ready");
      if (productModeRef.current === "conversation") setVoiceIntakeStage(talking ? "listening" : "captured");
    });
    session.addEventListener("turn", (event) => {
      const turn = (event as CustomEvent<VoiceTurn>).detail;
      setTranscript((current) => {
        const existing = current.findIndex((item) => item.id === turn.id);
        const next = existing >= 0 ? current.map((item) => item.id === turn.id ? turn : item) : [...current, turn].slice(-20);
        transcriptRef.current = next;
        return next;
      });
    });
    session.addEventListener("playback", (event) => {
      setPlaybackState((event as CustomEvent<{ state: LivePlaybackState }>).detail.state);
    });
    session.addEventListener("turn.completed", (event) => {
      const turn = (event as CustomEvent<VoiceTurn>).detail;
      if (turn.role === "user") {
        void completedTurnQueue.current.enqueue(() => processCompletedUserTurn(turn)).catch((caught) => {
          diagnostic({ event: "live.error", detail: (caught instanceof Error ? caught.message : "Completed voice turn processing failed.").slice(0, 500) });
        });
      }
    });
    session.addEventListener("delegation", (event) => {
      const delegation = (event as CustomEvent<LiveDelegation>).detail;
      if (delegation.causalTurn) void processCompletedUserTurn(delegation.causalTurn, delegation);
    });
    session.addEventListener("diagnostic", (event) => diagnostic((event as CustomEvent<LiveDiagnosticEvent>).detail));
    session.addEventListener("append.acknowledged", (event) => {
      const detail = (event as CustomEvent<{ kind: LiveAppendKind; clientEventId?: string }>).detail;
      const tracked = detail.clientEventId ? appendTracker.current.acknowledge(detail.clientEventId) : undefined;
      diagnostic({
        event: `live.${detail.kind}.acknowledged` as LiveDiagnosticEvent["event"],
        delegationId: tracked?.delegationId ?? undefined,
        ...tracked?.revision,
        detail: detail.clientEventId ? `event=${detail.clientEventId}` : undefined,
      });
    });
    session.addEventListener("live.error", (event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      diagnostic({ event: "live.error", detail: detail.message.slice(0, 500) });
      setError(`Voice session: ${detail.message}`);
    });
    try { await session.connect(); } catch (caught) {
      diagnostic({ event: "live.error", detail: (caught instanceof Error ? caught.message : "Voice connection failed.").slice(0, 500) });
      setVoiceStatus("offline");
      setPlaybackState("idle");
      setError(caught instanceof Error ? caught.message : "Voice connection failed.");
      session.close();
    }
  };

  const sendVoiceDecisionNow = () => {
    if (lifecycle.current.activeRound() || scrollRef.current) return;
    const latest = [...transcriptRef.current].reverse().find((turn) => turn.role === "user" && turn.complete && turn.text.trim());
    if (!latest) { setError("Finish one spoken decision turn first."); return; }
    const timer = fallbackTimers.current.get(latest.id);
    if (timer) clearTimeout(timer);
    fallbackTimers.current.delete(latest.id);
    if (!delegationCoordinator.current.claimFallback(latest.id)) return;
    initialHandoffGate.current.clear(latest.id);
    processedTurns.current.add(latest.id);
    setVoiceIntakeStage("preparing");
    diagnostic({ event: "live.delegation.fallback", detail: `causalTurn=${latest.id}; user requested immediate handoff` });
    void runCouncil({ conversationChanged: false });
  };

  const startNewDecision = () => {
    fetchAbort.current?.abort();
    fallbackTimers.current.forEach(clearTimeout);
    fallbackTimers.current.clear();
    voice.current?.close();
    voice.current = undefined;
    clearPersistedDecision();
    lifecycle.current = new VoiceCouncilLifecycle();
    deliberationId.current = undefined;
    conversationRevision.current = 0;
    deliberationRevision.current = 0;
    contextRef.current = "";
    scrollRef.current = undefined;
    transcriptRef.current = [];
    productModeRef.current = "conversation";
    processedTurns.current.clear();
    revisionedTurns.current.clear();
    readinessTurns.current.clear();
    initialHandoffGate.current = new InitialHandoffGate();
    delegationCoordinator.current = new VoiceDelegationCoordinator();
    appendTracker.current = new LiveAppendTracker();
    completedTurnQueue.current = new SerialTaskQueue();
    activeDelegation.current = null;
    setContext("");
    setConstraint("");
    setScroll(undefined);
    setCouncilTrace(undefined);
    setTranscript([]);
    setPhase("idle");
    setProductMode("conversation");
    setAgentStates(freshAgents());
    setRoundMode(undefined);
    setRouteNote(undefined);
    setChangedFact(undefined);
    setError(undefined);
    setVoiceStatus("offline");
    setPlaybackState("idle");
    setVoiceIntakeStage("ready");
    setDiagnostics([]);
  };

  const visiblePhase = productMode === "reconvening"
    ? "reconvening"
    : productMode === "deliberating"
      ? phase === "synthesizing" ? "synthesizing" : "deliberating"
      : voiceStatus === "talking"
        ? "listening"
        : playbackState === "speaking"
          ? "sutradhara_speaking"
          : playbackState === "suppressed"
            ? "interrupted"
      : productMode === "conversation" && voiceIntakeStage !== "ready"
          ? voiceIntakeStage
          : productMode;
  const hasCompletedVoiceTurn = transcript.some((turn) => turn.role === "user" && turn.complete && turn.text.trim());
  return <main className={`mode-${productMode}`}>
    <header>
      <div><span className="eyebrow">A Panchatantra-inspired AI decision council</span><h1>Sagacity <em>Syndicate</em></h1></div>
      <span className={`phase phase--${visiblePhase}`}>{visiblePhase.replaceAll("_", " ")}</span>
    </header>

    {productMode === "deliberating" || productMode === "reconvening" ? <section className="council-status">
      <span className="eyebrow">{productMode === "reconvening" ? "New constraint received" : "Council session"}</span>
      <h2>{productMode === "reconvening" ? "Reconvening council" : "The council is deliberating"}</h2>
      <p>{productMode === "reconvening" ? changedFact : `Current phase: ${phase.replace("_", " ")}`}</p>
    </section> : null}

    <section className="workspace">
      <div className="conversation-panel">
        <div className="input-mode" role="group" aria-label="Decision input mode">
          <button className={inputMode === "voice" ? "input-mode--active" : ""} onClick={() => setInputMode("voice")}>Speak with Sutradhara</button>
          <button className={inputMode === "text" ? "input-mode--active" : ""} onClick={() => setInputMode("text")}>Type decision</button>
        </div>

        {inputMode === "voice" ? <>
          <VoiceControl status={voiceStatus} productMode={productMode} playbackState={playbackState} onConnect={connectVoice} onTalk={(active) => voice.current?.setTalking(active)} />
          <p className="mode-help">No written Decision Context is required. Speak naturally; a ready decision is sent to the council automatically.</p>
          <div
            className="transcript"
            ref={transcriptElement}
            onScroll={(event) => {
              const element = event.currentTarget;
              setTranscriptAtLatest(isNearTranscriptEnd(element));
            }}
          >
            <div className="section-title"><span>Conversation</span><small>{transcript.length ? "latest turns" : "waiting for voice"}</small></div>
            {transcript.length ? transcript.slice(-12).map((turn) => <p className={turn.complete ? "" : "transcript-partial"} key={turn.id}><strong>{turn.role === "user" ? "You" : "Sutradhara"}</strong><span>{turn.text || "Listening…"}</span></p>) : <p className="muted">Your conversation with Sutradhara will appear here.</p>}
          </div>
          {!transcriptAtLatest && <button className="latest-button" onClick={() => {
            setTranscriptAtLatest(true);
            if (transcriptElement.current) scrollTranscriptToLatest(transcriptElement.current);
          }}>Jump to latest</button>}
          {productMode === "conversation" && hasCompletedVoiceTurn && voiceIntakeStage === "preparing" && <button className="secondary" onClick={sendVoiceDecisionNow}>Send to council now</button>}
          <details className="optional-context">
            <summary>Add precise written details — optional</summary>
            <label className="decision-input"><span>Optional context</span><textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Add exact figures, names, or constraints that are easier to type." /></label>
          </details>
        </> : <>
          <p className="mode-help">Write the decision and choose Convene. Voice is not required in this mode.</p>
          <label className="decision-input"><span>Decision context</span><textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="What are you deciding? Include your objective, hard constraints, and time horizon." /></label>
          {!scroll && <button className="primary" onClick={() => void runCouncil()} disabled={activePhases.includes(phase)}>Convene the council</button>}
        </>}

        {(scroll || (voiceStatus !== "offline" && activePhases.includes(phase))) && <div className="reconvene">
          <label><span>{voiceStatus === "offline" ? "What materially changed?" : "Precise typed correction"}</span><input value={constraint} onChange={(event) => setConstraint(event.target.value)} placeholder="Add or revise one material constraint" /></label>
          <button className="primary" onClick={() => void (voiceStatus === "offline" ? manualReconvene() : submitTypedCorrection())}>Reconvene</button>
          {voiceStatus !== "offline" && <small className="reconvene-help">This correction enters the voice transcript and safely starts a new council revision.</small>}
        </div>}
        {routeNote && <p className="route-note"><strong>Impact Router:</strong> {routeNote}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="council-panel">
        <div className="section-title"><span>The council</span><small>{roundMode ? `${roundMode} round` : "three independent lenses"}</small></div>
        {productMode === "conversation" && !scroll && <div className="agent-list">{names.map((agent) => <AgentCard key={agent} agent={agent} state={agentStates[agent]} />)}</div>}
        {!scroll && (productMode === "deliberating" || productMode === "reconvening") && <CouncilMap
          entries={decisionHistory}
          currentDeliberationId={deliberationId.current}
          currentTrace={councilTrace}
          mode={productMode}
          phase={phase}
          agentStates={agentStates}
          deliberationRevision={deliberationRevision.current}
          changedFact={changedFact}
        />}
        <DecisionScroll
          scroll={scroll}
          mode={productMode}
          onStartNew={startNewDecision}
          councilView={scroll ? <CouncilMap
            entries={decisionHistory}
            currentDeliberationId={deliberationId.current}
            currentScroll={scroll}
            currentTrace={councilTrace}
            mode={productMode}
            phase={phase}
            agentStates={agentStates}
            deliberationRevision={deliberationRevision.current}
            changedFact={changedFact}
          /> : undefined}
          emptyCopy={inputMode === "text"
            ? { title: "Ready for written context.", description: "Enter the decision, hard constraints, and time horizon, then choose Convene." }
            : emptyCopy[voiceIntakeStage]}
        />
        {scroll && productMode === "completed" && <DecisionWorkspace
          entries={decisionHistory}
          currentDeliberationId={deliberationId.current}
          onClear={() => {
            const current = [...decisionHistory].reverse().find((entry) => entry.deliberationId === deliberationId.current);
            clearDecisionHistory();
            setDecisionHistory(current ? recordDecisionHistory({
              deliberationId: current.deliberationId,
              conversationRevision: current.conversationRevision,
              deliberationRevision: current.deliberationRevision,
              roundMode: current.roundMode,
              scroll: current.scroll,
              trace: current.trace,
            }) : []);
          }}
        />}
      </div>
    </section>
    <DiagnosticsDrawer
      events={diagnostics}
      phase={phase}
      productMode={productMode}
      roundMode={roundMode}
      conversationRevision={conversationRevision.current}
      deliberationRevision={deliberationRevision.current}
      deliberationId={deliberationId.current}
      agentStates={agentStates}
    />
    <footer><span>Advice, not authority · Logs stay local</span><span>Revisions {conversationRevision.current}/{deliberationRevision.current}</span></footer>
  </main>;
}
