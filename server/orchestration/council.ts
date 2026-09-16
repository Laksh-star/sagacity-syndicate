import type { z } from "zod";
import { createHash } from "node:crypto";
import {
  AgentNameSchema,
  CritiqueSchema,
  CouncilTraceSchema,
  DecisionScrollSchema,
  ImpactRouteSchema,
  SpecialistOpinionSchema,
  type AgentName,
  type CouncilEvent,
  type CouncilPhase,
  type Critique,
  type CouncilTrace,
  type DecisionScroll,
  type DeliberationRequest,
  type ImpactRoute,
  type SpecialistOpinion,
} from "../../shared/schemas.js";
import { initialCouncilState, transition, type CouncilState } from "../../shared/state-machine.js";
import { AgentSessionStreamError, type AgentRuntime, type AgentRun, type AgentRunTelemetry } from "../agents/runtime.js";
import { JsonlLogger } from "../logging/jsonl.js";
import { loadPrompt } from "../prompts.js";

type Emit = (event: CouncilEvent) => void;
type RunMetric = AgentRunTelemetry & { stage: string; role?: string; model: string; sessionId: string };
type RecordState = {
  state: CouncilState;
  abort: AbortController;
  sessions: Partial<Record<AgentName, string>>;
  opinions: Partial<Record<AgentName, SpecialistOpinion>>;
  critiques: Partial<Record<AgentName, Critique>>;
  activeSessions: Set<string>;
  metrics: RunMetric[];
  scroll?: DecisionScroll;
  trace?: CouncilTrace;
};

const agents = AgentNameSchema.options;

export class CouncilOrchestrator {
  private readonly records = new Map<string, RecordState>();

  constructor(
    private readonly runtime: AgentRuntime,
    private readonly models: { council: string; synthesis: string },
    private readonly logger = new JsonlLogger(),
  ) {}

  async deliberate(request: DeliberationRequest, emit: Emit): Promise<{ deliberationId: string; scroll: DecisionScroll; trace?: CouncilTrace }> {
    const id = request.deliberationId ?? crypto.randomUUID();
    const existing = this.records.get(id);
    if (existing && request.conversationRevision < existing.state.conversationRevision) {
      throw new Error("Conversation revision is stale.");
    }
    if (existing && request.deliberationRevision <= existing.state.deliberationRevision) {
      throw new Error("Deliberation revision must increase.");
    }

    const record = existing ?? {
      state: initialCouncilState(), abort: new AbortController(), sessions: {}, opinions: {}, critiques: {}, activeSessions: new Set(), metrics: [],
    };
    const hydratedFromRequest = !existing && Boolean(request.previousScroll);
    if (hydratedFromRequest) record.scroll = request.previousScroll;
    if (existing) {
      record.abort.abort("Superseded by a newer deliberation.");
      if (["routing", "independent", "cross_examining", "synthesizing"].includes(record.state.phase)) {
        record.state.phase = transition(record.state.phase, "interrupted");
        record.state.agents = initialCouncilState().agents;
      }
    }
    const runAbort = new AbortController();
    record.abort = runAbort;
    record.state.conversationRevision = request.conversationRevision;
    record.state.deliberationRevision = request.deliberationRevision;
    record.metrics = [];
    this.records.set(id, record);

    if (record.state.phase === "idle") this.setPhase(id, record, "ready", emit);
    else if (["completed", "interrupted", "failed"].includes(record.state.phase)) this.setPhase(id, record, "ready", emit);

    const captured = {
      conversationRevision: request.conversationRevision,
      deliberationRevision: request.deliberationRevision,
    };
    const roundStartedAt = Date.now();

    try {
      let selected: AgentName[] = [...agents];
      let mode: "initial" | "selective" | "full" | "preserved" = existing || hydratedFromRequest ? "full" : "initial";
      if (hydratedFromRequest) {
        await this.log(id, record, "council.context.hydrated", {
          source: "previousScroll",
          reason: "The server had no in-memory record for this persisted browser decision.",
        });
      }
      if (request.changedConstraint && record.scroll) {
        this.setPhase(id, record, "routing", emit);
        const route = await this.routeImpact(id, request, record, runAbort.signal);
        this.assertCurrent(record, captured);
        emit({ type: "router.result", route });
        await this.log(id, record, "router.result", route);
        if (!route.material) {
          this.setPhase(id, record, "completed", emit);
          emit({ type: "council.result", scroll: record.scroll, trace: record.trace, mode: "preserved" });
          await this.logTelemetry(id, record, roundStartedAt);
          return { deliberationId: id, scroll: record.scroll, trace: record.trace };
        }
        selected = route.confidence < 0.65 ? [...agents] : route.affectedAgents;
        // A persisted Scroll can restore authoritative decision context after a
        // server restart, but it cannot restore provider sessions or bounded
        // specialist opinions. Run all three specialists once to rebuild that
        // state instead of inventing missing opinions for a selective round.
        if (hydratedFromRequest) selected = [...agents];
        mode = selected.length === agents.length ? "full" : "selective";
      }

      this.setPhase(id, record, "independent", emit);
      await Promise.all(selected.map(async (agent) => {
        this.setAgent(id, record, agent, "thinking", emit);
        const opinion = await this.runOpinion(id, agent, request.context, request.changedConstraint, record, runAbort.signal);
        this.assertCurrent(record, captured);
        record.opinions[agent] = opinion;
        this.setAgent(id, record, agent, "done", emit);
        await this.log(id, record, "agent.opinion", opinion);
      }));

      if (agents.some((agent) => !record.opinions[agent])) throw new Error("Council is missing a specialist opinion.");
      this.setPhase(id, record, "cross_examining", emit);
      await Promise.all(selected.map(async (agent) => {
        this.setAgent(id, record, agent, "challenging", emit);
        const critique = await this.runCritique(id, agent, record, runAbort.signal);
        this.assertCurrent(record, captured);
        record.critiques[agent] = critique;
        this.setAgent(id, record, agent, "done", emit);
        await this.log(id, record, "agent.critique", critique);
      }));

      this.setPhase(id, record, "synthesizing", emit);
      const scroll = await this.synthesize(id, request.context, record, runAbort.signal);
      this.assertCurrent(record, captured);
      const trace = createCouncilTrace(record.opinions, record.critiques, scroll);
      record.scroll = scroll;
      record.trace = trace;
      this.setPhase(id, record, "completed", emit);
      emit({ type: "council.result", scroll, trace, mode });
      await this.log(id, record, "council.result", { mode, scroll, trace });
      await this.logTelemetry(id, record, roundStartedAt);
      return { deliberationId: id, scroll, trace };
    } catch (error) {
      const current = record.state.conversationRevision === captured.conversationRevision
        && record.state.deliberationRevision === captured.deliberationRevision;
      if (runAbort.signal.aborted || !current || (error instanceof DOMException && error.name === "AbortError")) {
        if (current && record.state.phase !== "interrupted") this.setPhase(id, record, "interrupted", emit);
        emit({ type: "council.interrupted", reason: "A newer conversation constraint superseded this round." });
      } else if (current) {
        runAbort.abort("A council provider run failed.");
        const activeSessionIds = [...record.activeSessions];
        await Promise.allSettled(activeSessionIds.map((sessionId) => this.runtime.cancel(
          sessionId,
          cancellationIdempotencyKey(id, record.state.deliberationRevision, sessionId),
        )));
        for (const agent of agents) if (["thinking", "challenging"].includes(record.state.agents[agent])) this.setAgent(id, record, agent, "error", emit);
        this.setPhase(id, record, "failed", emit);
        const message = error instanceof Error ? error.message : "Council failed.";
        emit({ type: "council.error", message });
        await this.log(id, record, "council.error", { message });
      }
      throw error;
    }
  }

  async interrupt(id: string, nextConversationRevision: number, reason: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    record.state.conversationRevision = Math.max(record.state.conversationRevision, nextConversationRevision);
    record.abort.abort(reason);
    if (["routing", "independent", "cross_examining", "synthesizing"].includes(record.state.phase)) {
      record.state.phase = transition(record.state.phase, "interrupted");
    }
    const sessionIds = [...new Set([...Object.values(record.sessions), ...record.activeSessions])];
    await Promise.allSettled(sessionIds.map((sessionId) => this.runtime.cancel(
      sessionId,
      cancellationIdempotencyKey(id, record.state.deliberationRevision, sessionId),
    )));
    await this.log(id, record, "council.interrupt", { reason });
    return true;
  }

  private async routeImpact(id: string, request: DeliberationRequest, record: RecordState, signal: AbortSignal): Promise<ImpactRoute> {
    const instructions = await loadPrompt("impact-router");
    const input = JSON.stringify({
      priorDecision: request.previousScroll,
      changedConstraint: request.changedConstraint,
      currentContext: request.context,
    });
    try {
      const run = await this.startRun(id, record, "impact_router", undefined, this.models.council, { instructions, input, schema: ImpactRouteSchema, signal });
      return ImpactRouteSchema.parse(run.output);
    } catch (error) {
      if (signal.aborted) throw error;
      return {
        material: true,
        affectedAgents: [...agents],
        reason: "Impact routing was ambiguous, so the full council will reconvene.",
        preservedFields: [],
        confidence: 0,
      };
    }
  }

  private async runOpinion(
    id: string,
    agent: AgentName,
    context: string,
    changedConstraint: string | undefined,
    record: RecordState,
    signal: AbortSignal,
  ): Promise<SpecialistOpinion> {
    const input = JSON.stringify({ phase: "opinion", decisionContext: context, changedConstraint, priorOpinion: record.opinions[agent] });
    let run: AgentRun<unknown>;
    const sessionId = record.sessions[agent];
    if (sessionId) run = await this.continueRun(id, record, "opinion", agent, this.models.council, { sessionId, input, schema: SpecialistOpinionSchema, signal });
    else run = await this.startRun(id, record, "opinion", agent, this.models.council, {
      instructions: `${await loadPrompt(agent)}\nYour agent identity is ${agent}.`,
      input,
      schema: SpecialistOpinionSchema,
      signal,
    });
    record.sessions[agent] = run.sessionId;
    const opinion = SpecialistOpinionSchema.parse(run.output);
    if (opinion.agent !== agent) throw new Error(`${agent} returned the wrong agent identity.`);
    return opinion;
  }

  private async runCritique(id: string, agent: AgentName, record: RecordState, signal: AbortSignal): Promise<Critique> {
    const selfOpinion = record.opinions[agent];
    if (!selfOpinion) throw new Error(`Missing ${agent} opinion for cross-examination.`);
    const others = Object.fromEntries(Object.entries(record.opinions).filter(([name]) => name !== agent));
    const input = JSON.stringify({ phase: "critique", selfOpinion, otherOpinions: others });
    const run = await this.startRun(id, record, "critique", agent, this.models.council, {
      instructions: `${await loadPrompt(agent)}\n${await loadPrompt("cross-examination")}\nYour critic identity is ${agent}.`,
      input,
      schema: CritiqueSchema,
      signal,
    });
    const critique = CritiqueSchema.parse(run.output);
    if (critique.critic !== agent) throw new Error(`${agent} returned the wrong critic identity.`);
    const targetAgents = agents.filter((candidate) => candidate !== agent);
    const targetsWereCanonical = critique.targetAgents.length === targetAgents.length
      && targetAgents.every((target) => critique.targetAgents.includes(target));
    if (!targetsWereCanonical) {
      await this.log(id, record, "agent.critique.normalized", {
        critic: agent,
        reason: critique.targetAgents.includes(agent) ? "self_target_removed" : "peer_targets_restored",
      });
    }
    // The relationship graph is application-owned: every specialist critiques
    // the other two. Never allow a model-produced target list to create a
    // self-edge or omit a peer from the bounded Council Map.
    return { ...critique, targetAgents };
  }

  private async synthesize(id: string, context: string, record: RecordState, signal: AbortSignal): Promise<DecisionScroll> {
    const input = JSON.stringify({ context, opinions: record.opinions, critiques: record.critiques });
    const run = await this.startRun(id, record, "synthesis", undefined, this.models.synthesis, {
      instructions: await loadPrompt("synthesis"),
      input,
      schema: DecisionScrollSchema,
      signal,
    });
    return DecisionScrollSchema.parse(run.output);
  }

  private async startRun<T>(
    id: string,
    record: RecordState,
    stage: string,
    role: string | undefined,
    model: string,
    args: { instructions: string; input: string; schema: z.ZodType<T>; signal?: AbortSignal },
  ): Promise<AgentRun<T>> {
    let activeSessionId: string | undefined;
    const startedAt = Date.now();
    const capturedDeliberationRevision = record.state.deliberationRevision;
    try {
      const run = await this.runtime.start({
        model,
        ...args,
        metadata: this.sessionMetadata(id, record, stage, role),
        onSessionId: (sessionId) => {
          activeSessionId = sessionId;
          record.activeSessions.add(sessionId);
        },
      });
      if (record.state.deliberationRevision === capturedDeliberationRevision) {
        await this.recordRun(id, record, stage, role, model, run);
      }
      return run;
    } catch (error) {
      if (record.state.deliberationRevision === capturedDeliberationRevision) {
        await this.log(id, record, "agent.run.error", {
          stage, role, model, sessionId: activeSessionId,
          durationMs: Date.now() - startedAt,
          providerStatus: error instanceof AgentSessionStreamError ? error.providerStatus : undefined,
          message: error instanceof Error ? error.message.slice(0, 500) : "Agent run failed.",
        });
      }
      throw error;
    } finally {
      if (activeSessionId) record.activeSessions.delete(activeSessionId);
    }
  }

  private async continueRun<T>(
    id: string,
    record: RecordState,
    stage: string,
    role: string | undefined,
    model: string,
    args: { sessionId: string; input: string; schema: z.ZodType<T>; signal?: AbortSignal },
  ): Promise<AgentRun<T>> {
    let activeSessionId = args.sessionId;
    const startedAt = Date.now();
    const capturedDeliberationRevision = record.state.deliberationRevision;
    record.activeSessions.add(activeSessionId);
    try {
      const run = await this.runtime.continue({
        ...args,
        onSessionId: (sessionId) => {
          record.activeSessions.delete(activeSessionId);
          activeSessionId = sessionId;
          record.activeSessions.add(sessionId);
        },
      });
      if (record.state.deliberationRevision === capturedDeliberationRevision) {
        await this.recordRun(id, record, stage, role, model, run);
      }
      return run;
    } catch (error) {
      if (record.state.deliberationRevision === capturedDeliberationRevision) {
        await this.log(id, record, "agent.run.error", {
          stage, role, model, sessionId: activeSessionId,
          durationMs: Date.now() - startedAt,
          providerStatus: error instanceof AgentSessionStreamError ? error.providerStatus : undefined,
          message: error instanceof Error ? error.message.slice(0, 500) : "Agent continuation failed.",
        });
      }
      throw error;
    } finally {
      record.activeSessions.delete(activeSessionId);
    }
  }

  private sessionMetadata(id: string, record: RecordState, stage: string, role?: string): Record<string, string> {
    return {
      application: "sagacity-syndicate",
      deliberation_id: id,
      conversation_revision: String(record.state.conversationRevision),
      deliberation_revision: String(record.state.deliberationRevision),
      stage,
      ...(role ? { role } : {}),
    };
  }

  private async recordRun<T>(id: string, record: RecordState, stage: string, role: string | undefined, model: string, run: AgentRun<T>): Promise<void> {
    const metric: RunMetric = {
      stage, role, model, sessionId: run.sessionId,
      durationMs: run.telemetry?.durationMs ?? 0,
      repaired: run.telemetry?.repaired ?? false,
      recovered: run.telemetry?.recovered ?? false,
      usage: run.telemetry?.usage,
    };
    record.metrics.push(metric);
    await this.log(id, record, "agent.run", metric);
  }

  private logTelemetry(id: string, record: RecordState, roundStartedAt: number): Promise<void> {
    const usage = record.metrics.reduce((total, metric) => ({
      inputTokens: total.inputTokens + (metric.usage?.inputTokens ?? 0),
      cachedInputTokens: total.cachedInputTokens + (metric.usage?.cachedInputTokens ?? 0),
      outputTokens: total.outputTokens + (metric.usage?.outputTokens ?? 0),
      reasoningOutputTokens: total.reasoningOutputTokens + (metric.usage?.reasoningOutputTokens ?? 0),
      totalTokens: total.totalTokens + (metric.usage?.totalTokens ?? 0),
    }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 });
    return this.log(id, record, "council.telemetry", {
      durationMs: Date.now() - roundStartedAt,
      calls: record.metrics.length,
      repairedCalls: record.metrics.filter((metric) => metric.repaired).length,
      recoveredCalls: record.metrics.filter((metric) => metric.recovered).length,
      usage,
    });
  }

  private assertCurrent(record: RecordState, captured: { conversationRevision: number; deliberationRevision: number }): void {
    if (record.state.conversationRevision !== captured.conversationRevision || record.state.deliberationRevision !== captured.deliberationRevision) {
      throw new DOMException("Stale deliberation", "AbortError");
    }
  }

  private setPhase(id: string, record: RecordState, next: CouncilPhase, emit: Emit): void {
    record.state.phase = transition(record.state.phase, next);
    emit({ type: "council.phase", phase: next });
    void this.log(id, record, "council.phase", { phase: next });
  }

  private setAgent(id: string, record: RecordState, agent: AgentName, state: CouncilState["agents"][AgentName], emit: Emit): void {
    record.state.agents[agent] = state;
    emit({ type: "agent.state", agent, state });
    void this.log(id, record, "agent.state", { agent, state });
  }

  private log(id: string, record: RecordState, event: string, data?: unknown): Promise<void> {
    return this.logger.write({
      deliberationId: id,
      conversationRevision: record.state.conversationRevision,
      deliberationRevision: record.state.deliberationRevision,
      event,
      data,
    });
  }
}

export function createCouncilTrace(
  opinions: Partial<Record<AgentName, SpecialistOpinion>>,
  critiques: Partial<Record<AgentName, Critique>>,
  scroll: DecisionScroll,
): CouncilTrace {
  const survived: Record<AgentName, string> = {
    forethought: scroll.forethought,
    quickaction: scroll.quickaction,
    examiner: scroll.examiner,
  };
  const contributions = Object.fromEntries(agents.map((agent) => {
    const opinion = opinions[agent];
    const critique = critiques[agent];
    if (!opinion || !critique) throw new Error(`Council trace is missing ${agent} output.`);
    return [agent, {
      agent,
      openedWith: opinion.recommendation,
      challenged: critique.revisionAdvice,
      survived: survived[agent],
    }];
  }));
  const critiqueEdges = agents.flatMap((critic) => {
    const critique = critiques[critic];
    if (!critique) return [];
    return agents.filter((target) => target !== critic).map((target) => ({
      critic,
      target,
      challenge: critique.revisionAdvice,
      severity: critique.severity,
    }));
  });
  return CouncilTraceSchema.parse({ contributions, critiqueEdges });
}

export function cancellationIdempotencyKey(deliberationId: string, deliberationRevision: number, sessionId: string): string {
  return `sagacity-cancel-${createHash("sha256").update(`${deliberationId}:${deliberationRevision}:${sessionId}`).digest("hex")}`;
}
