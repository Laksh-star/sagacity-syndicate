import { describe, expect, it } from "vitest";
import { MockAgentRuntime } from "../server/agents/mock-runtime.js";
import type { AgentRun, AgentRuntime } from "../server/agents/runtime.js";
import { cancellationIdempotencyKey, CouncilOrchestrator } from "../server/orchestration/council.js";
import type { CouncilEvent } from "../shared/schemas.js";

const silentLogger = { write: async () => {} };

describe("CouncilOrchestrator", () => {
  it("actually overlaps independent backend runs", async () => {
    const base = new MockAgentRuntime();
    let inFlight = 0;
    let maximum = 0;
    const track = async <T>(work: () => Promise<T>) => {
      inFlight += 1;
      maximum = Math.max(maximum, inFlight);
      try { return await work(); } finally { inFlight -= 1; }
    };
    const runtime: AgentRuntime = {
      start: (args) => track(() => base.start(args)),
      continue: (args) => track(() => base.continue(args)),
      cancel: (id) => base.cancel(id),
    };
    const council = new CouncilOrchestrator(runtime, { council: "mock", synthesis: "mock" }, silentLogger as never);
    await council.deliberate({
      deliberationId: "parallel", conversationRevision: 1, deliberationRevision: 1, context: "Should we run a pilot?",
    }, () => {});
    expect(maximum).toBeGreaterThanOrEqual(3);
  });

  it("runs independent opinions, cross-examination, then synthesis", async () => {
    const events: CouncilEvent[] = [];
    const council = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, silentLogger as never);
    const result = await council.deliberate({
      deliberationId: "test", conversationRevision: 1, deliberationRevision: 1,
      context: "Should we launch a reversible pilot next week with a fixed budget?",
    }, (event) => events.push(event));
    const phases = events.filter((event) => event.type === "council.phase").map((event) => event.type === "council.phase" && event.phase);
    expect(phases).toEqual(["ready", "independent", "cross_examining", "synthesizing", "completed"]);
    expect(events.filter((event) => event.type === "agent.state" && event.state === "thinking")).toHaveLength(3);
    expect(events.filter((event) => event.type === "agent.state" && event.state === "challenging")).toHaveLength(3);
    expect(result.scroll.confidence).toBeGreaterThan(0);
  });

  it("uses the Impact Router to reconvene only affected agents", async () => {
    const events: CouncilEvent[] = [];
    const council = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, silentLogger as never);
    const first = await council.deliberate({
      deliberationId: "reconvene", conversationRevision: 1, deliberationRevision: 1, context: "Should we pilot?",
    }, () => {});
    await council.deliberate({
      deliberationId: "reconvene", conversationRevision: 2, deliberationRevision: 2,
      context: "Should we pilot? Budget is now capped.", changedConstraint: "Budget is capped at 10,000.", previousScroll: first.scroll,
    }, (event) => events.push(event));
    const thinking = events.filter((event) => event.type === "agent.state" && event.state === "thinking")
      .map((event) => event.type === "agent.state" ? event.agent : "");
    expect(thinking).toEqual(expect.arrayContaining(["quickaction", "examiner"]));
    expect(thinking).not.toContain("forethought");
    expect(events).toContainEqual(expect.objectContaining({ type: "council.result", mode: "selective" }));
  });

  it("hydrates a persisted Scroll and fully reconvenes after a server restart", async () => {
    const seedCouncil = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, silentLogger as never);
    const first = await seedCouncil.deliberate({
      deliberationId: "persisted", conversationRevision: 7, deliberationRevision: 1,
      context: "Should we launch a narrow news product pilot?",
    }, () => {});

    const restartedCouncil = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, silentLogger as never);
    const events: CouncilEvent[] = [];
    await restartedCouncil.deliberate({
      deliberationId: "persisted", conversationRevision: 8, deliberationRevision: 2,
      context: "Prior verified decision: launch a narrow news product pilot. Current change: decide within five days.",
      changedConstraint: "The decision deadline is five days, not five weeks.",
      previousScroll: first.scroll,
    }, (event) => events.push(event));

    expect(events).toContainEqual(expect.objectContaining({ type: "council.phase", phase: "routing" }));
    expect(events.filter((event) => event.type === "agent.state" && event.state === "thinking")).toHaveLength(3);
    expect(events).toContainEqual(expect.objectContaining({ type: "council.result", mode: "full" }));
  });

  it("invalidates an interrupted conversation revision", async () => {
    const events: CouncilEvent[] = [];
    const council = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, silentLogger as never);
    const pending = council.deliberate({
      deliberationId: "interrupt", conversationRevision: 1, deliberationRevision: 1, context: "Should we proceed?",
    }, (event) => events.push(event));
    await new Promise((resolve) => setTimeout(resolve, 15));
    await council.interrupt("interrupt", 2, "Constraint changed.");
    await expect(pending).rejects.toBeDefined();
    expect(events.some((event) => event.type === "council.result")).toBe(false);
    expect(events.some((event) => event.type === "council.interrupted")).toBe(true);
  });

  it("prevents an aborted old round from mutating its replacement", async () => {
    const council = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, silentLogger as never);
    const oldEvents: CouncilEvent[] = [];
    const newEvents: CouncilEvent[] = [];
    const oldRound = council.deliberate({
      deliberationId: "supersede", conversationRevision: 1, deliberationRevision: 1, context: "Should we proceed?",
    }, (event) => oldEvents.push(event));
    await new Promise((resolve) => setTimeout(resolve, 15));
    await council.interrupt("supersede", 2, "Budget changed.");
    const replacement = council.deliberate({
      deliberationId: "supersede", conversationRevision: 2, deliberationRevision: 2,
      context: "Should we proceed with a smaller budget?", changedConstraint: "The budget is lower.",
    }, (event) => newEvents.push(event));

    await expect(oldRound).rejects.toBeDefined();
    await expect(replacement).resolves.toHaveProperty("scroll");
    expect(newEvents.some((event) => event.type === "council.result")).toBe(true);
    expect(newEvents.some((event) => event.type === "council.error")).toBe(false);
  });

  it("supersedes an overlapping newer revision without an illegal phase transition", async () => {
    const council = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, silentLogger as never);
    const oldEvents: CouncilEvent[] = [];
    const newEvents: CouncilEvent[] = [];
    const oldRound = council.deliberate({
      deliberationId: "overlap", conversationRevision: 1, deliberationRevision: 1, context: "Should we proceed?",
    }, (event) => oldEvents.push(event));
    await new Promise((resolve) => setTimeout(resolve, 15));
    const replacement = council.deliberate({
      deliberationId: "overlap", conversationRevision: 2, deliberationRevision: 2, context: "Should we proceed with the same decision?",
    }, (event) => newEvents.push(event));

    await expect(oldRound).rejects.toBeDefined();
    await expect(replacement).resolves.toHaveProperty("scroll");
    expect(newEvents).not.toContainEqual(expect.objectContaining({ type: "council.error" }));
    expect(newEvents.filter((event) => event.type === "council.phase").map((event) => event.type === "council.phase" && event.phase))
      .toEqual(["ready", "independent", "cross_examining", "synthesizing", "completed"]);
  });

  it("logs bounded per-run and aggregate telemetry", async () => {
    const entries: Array<{ event: string; data?: unknown }> = [];
    const logger = { write: async (entry: { event: string; data?: unknown }) => { entries.push(entry); } };
    const council = new CouncilOrchestrator(new MockAgentRuntime(), { council: "mock", synthesis: "mock" }, logger as never);
    await council.deliberate({
      deliberationId: "telemetry", conversationRevision: 1, deliberationRevision: 1, context: "Should we run a pilot?",
    }, () => {});

    expect(entries.filter((entry) => entry.event === "agent.run")).toHaveLength(7);
    expect(entries).toContainEqual(expect.objectContaining({
      event: "council.telemetry",
      data: expect.objectContaining({ calls: 7, repairedCalls: 0 }),
    }));
  });

  it("normalizes a specialist self-target without failing synthesis", async () => {
    const base = new MockAgentRuntime();
    const entries: Array<{ event: string; data?: unknown }> = [];
    const logger = { write: async (entry: { event: string; data?: unknown }) => { entries.push(entry); } };
    const runtime: AgentRuntime = {
      start: async <T>(args: Parameters<AgentRuntime["start"]>[0]): Promise<AgentRun<T>> => {
        const run = await base.start(args) as AgentRun<T>;
        if (args.input.includes('"phase":"critique"') && args.instructions.includes("Your critic identity is forethought.")) {
          return {
            ...run,
            output: { ...(run.output as object), targetAgents: ["forethought", "quickaction"] },
          } as AgentRun<T>;
        }
        return run;
      },
      continue: (args) => base.continue(args),
      cancel: (id, key) => base.cancel(id, key),
    };
    const council = new CouncilOrchestrator(runtime, { council: "mock", synthesis: "mock" }, logger as never);

    const result = await council.deliberate({
      deliberationId: "self-target", conversationRevision: 1, deliberationRevision: 1, context: "Should we run a pilot?",
    }, () => {});

    expect(result.trace?.critiqueEdges).toHaveLength(6);
    expect(result.trace?.critiqueEdges.every((edge) => edge.critic !== edge.target)).toBe(true);
    expect(entries).toContainEqual(expect.objectContaining({
      event: "agent.critique.normalized",
      data: { critic: "forethought", reason: "self_target_removed" },
    }));
  });

  it("uses deterministic bounded cancellation keys", () => {
    const first = cancellationIdempotencyKey("decision", 2, "session");
    expect(first).toBe(cancellationIdempotencyKey("decision", 2, "session"));
    expect(first).not.toBe(cancellationIdempotencyKey("decision", 3, "session"));
    expect(first.length).toBeLessThanOrEqual(256);
  });

  it("passes idempotency keys when cancelling active provider sessions", async () => {
    const base = new MockAgentRuntime();
    const cancellations: Array<{ sessionId: string; key?: string }> = [];
    const runtime: AgentRuntime = {
      start: (args) => base.start(args),
      continue: (args) => base.continue(args),
      cancel: async (sessionId, key) => { cancellations.push({ sessionId, key }); },
      status: (sessionId) => base.status(sessionId),
    };
    const council = new CouncilOrchestrator(runtime, { council: "mock", synthesis: "mock" }, silentLogger as never);
    const pending = council.deliberate({
      deliberationId: "cancel-keys", conversationRevision: 1, deliberationRevision: 1, context: "Should we proceed?",
    }, () => {});
    await new Promise((resolve) => setTimeout(resolve, 15));
    await council.interrupt("cancel-keys", 2, "Constraint changed.");
    await expect(pending).rejects.toBeDefined();

    expect(cancellations).toHaveLength(3);
    expect(cancellations.every(({ key }) => key?.startsWith("sagacity-cancel-") && key.length <= 256)).toBe(true);
    expect(new Set(cancellations.map(({ key }) => key)).size).toBe(3);
  });
});
