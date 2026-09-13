import type { z } from "zod";
import {
  AgentNameSchema,
  CritiqueSchema,
  DecisionScrollSchema,
  ImpactRouteSchema,
  SpecialistOpinionSchema,
  type AgentName,
  type CouncilEvent,
  type CouncilPhase,
  type Critique,
  type DecisionScroll,
  type DeliberationRequest,
  type ImpactRoute,
  type SpecialistOpinion,
} from "../../shared/schemas.js";
import { initialCouncilState, transition, type CouncilState } from "../../shared/state-machine.js";
import type { AgentRuntime, AgentRun } from "../agents/runtime.js";
import { JsonlLogger } from "../logging/jsonl.js";
import { loadPrompt } from "../prompts.js";

type Emit = (event: CouncilEvent) => void;
type RecordState = {
  state: CouncilState;
  abort: AbortController;
  sessions: Partial<Record<AgentName, string>>;
  opinions: Partial<Record<AgentName, SpecialistOpinion>>;
  critiques: Partial<Record<AgentName, Critique>>;
  scroll?: DecisionScroll;
};

const agents = AgentNameSchema.options;

export class CouncilOrchestrator {
  private readonly records = new Map<string, RecordState>();

  constructor(
    private readonly runtime: AgentRuntime,
    private readonly models: { council: string; synthesis: string },
    private readonly logger = new JsonlLogger(),
  ) {}

  async deliberate(request: DeliberationRequest, emit: Emit): Promise<{ deliberationId: string; scroll: DecisionScroll }> {
    const id = request.deliberationId ?? crypto.randomUUID();
    const existing = this.records.get(id);
    if (existing && request.conversationRevision < existing.state.conversationRevision) {
      throw new Error("Conversation revision is stale.");
    }
    if (existing && request.deliberationRevision <= existing.state.deliberationRevision) {
      throw new Error("Deliberation revision must increase.");
    }

    const record = existing ?? {
      state: initialCouncilState(), abort: new AbortController(), sessions: {}, opinions: {}, critiques: {},
    };
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
    this.records.set(id, record);

    if (record.state.phase === "idle") this.setPhase(id, record, "ready", emit);
    else if (["completed", "interrupted", "failed"].includes(record.state.phase)) this.setPhase(id, record, "ready", emit);

    const captured = {
      conversationRevision: request.conversationRevision,
      deliberationRevision: request.deliberationRevision,
    };

    try {
      let selected: AgentName[] = [...agents];
      let mode: "initial" | "selective" | "full" | "preserved" = existing ? "full" : "initial";
      if (existing && request.changedConstraint && record.scroll) {
        this.setPhase(id, record, "routing", emit);
        const route = await this.routeImpact(request, runAbort.signal);
        this.assertCurrent(record, captured);
        emit({ type: "router.result", route });
        await this.log(id, record, "router.result", route);
        if (!route.material) {
          this.setPhase(id, record, "completed", emit);
          emit({ type: "council.result", scroll: record.scroll, mode: "preserved" });
          return { deliberationId: id, scroll: record.scroll };
        }
        selected = route.confidence < 0.65 ? [...agents] : route.affectedAgents;
        mode = selected.length === agents.length ? "full" : "selective";
      }

      this.setPhase(id, record, "independent", emit);
      await Promise.all(selected.map(async (agent) => {
        this.setAgent(id, record, agent, "thinking", emit);
        const opinion = await this.runOpinion(agent, request.context, request.changedConstraint, record, runAbort.signal);
        this.assertCurrent(record, captured);
        record.opinions[agent] = opinion;
        this.setAgent(id, record, agent, "done", emit);
        await this.log(id, record, "agent.opinion", opinion);
      }));

      if (agents.some((agent) => !record.opinions[agent])) throw new Error("Council is missing a specialist opinion.");
      this.setPhase(id, record, "cross_examining", emit);
      await Promise.all(selected.map(async (agent) => {
        this.setAgent(id, record, agent, "challenging", emit);
        const critique = await this.runCritique(agent, record, runAbort.signal);
        this.assertCurrent(record, captured);
        record.critiques[agent] = critique;
        this.setAgent(id, record, agent, "done", emit);
        await this.log(id, record, "agent.critique", critique);
      }));

      this.setPhase(id, record, "synthesizing", emit);
      const scroll = await this.synthesize(request.context, record, runAbort.signal);
      this.assertCurrent(record, captured);
      record.scroll = scroll;
      this.setPhase(id, record, "completed", emit);
      emit({ type: "council.result", scroll, mode });
      await this.log(id, record, "council.result", { mode, scroll });
      return { deliberationId: id, scroll };
    } catch (error) {
      const current = record.state.conversationRevision === captured.conversationRevision
        && record.state.deliberationRevision === captured.deliberationRevision;
      if (runAbort.signal.aborted || !current || (error instanceof DOMException && error.name === "AbortError")) {
        if (current && record.state.phase !== "interrupted") this.setPhase(id, record, "interrupted", emit);
        emit({ type: "council.interrupted", reason: "A newer conversation constraint superseded this round." });
      } else if (current) {
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
    await Promise.allSettled(Object.values(record.sessions).map((sessionId) => this.runtime.cancel(sessionId)));
    await this.log(id, record, "council.interrupt", { reason });
    return true;
  }

  private async routeImpact(request: DeliberationRequest, signal: AbortSignal): Promise<ImpactRoute> {
    const instructions = await loadPrompt("impact-router");
    const input = JSON.stringify({
      priorDecision: request.previousScroll,
      changedConstraint: request.changedConstraint,
      currentContext: request.context,
    });
    try {
      const run = await this.runtime.start({ model: this.models.council, instructions, input, schema: ImpactRouteSchema, signal });
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
    agent: AgentName,
    context: string,
    changedConstraint: string | undefined,
    record: RecordState,
    signal: AbortSignal,
  ): Promise<SpecialistOpinion> {
    const input = JSON.stringify({ phase: "opinion", decisionContext: context, changedConstraint, priorOpinion: record.opinions[agent] });
    let run: AgentRun<unknown>;
    const sessionId = record.sessions[agent];
    if (sessionId) run = await this.runtime.continue({ sessionId, input, schema: SpecialistOpinionSchema, signal });
    else run = await this.runtime.start({
      model: this.models.council,
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

  private async runCritique(agent: AgentName, record: RecordState, signal: AbortSignal): Promise<Critique> {
    const selfOpinion = record.opinions[agent];
    if (!selfOpinion) throw new Error(`Missing ${agent} opinion for cross-examination.`);
    const others = Object.fromEntries(Object.entries(record.opinions).filter(([name]) => name !== agent));
    const input = JSON.stringify({ phase: "critique", selfOpinion, otherOpinions: others });
    const run = await this.runtime.start({
      model: this.models.council,
      instructions: `${await loadPrompt(agent)}\n${await loadPrompt("cross-examination")}\nYour critic identity is ${agent}.`,
      input,
      schema: CritiqueSchema,
      signal,
    });
    const critique = CritiqueSchema.parse(run.output);
    if (critique.critic !== agent) throw new Error(`${agent} returned the wrong critic identity.`);
    return critique;
  }

  private async synthesize(context: string, record: RecordState, signal: AbortSignal): Promise<DecisionScroll> {
    const input = JSON.stringify({ context, opinions: record.opinions, critiques: record.critiques });
    const run = await this.runtime.start({
      model: this.models.synthesis,
      instructions: await loadPrompt("synthesis"),
      input,
      schema: DecisionScrollSchema,
      signal,
    });
    return DecisionScrollSchema.parse(run.output);
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
