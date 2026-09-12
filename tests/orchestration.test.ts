import { describe, expect, it } from "vitest";
import { MockAgentRuntime } from "../server/agents/mock-runtime.js";
import type { AgentRuntime } from "../server/agents/runtime.js";
import { CouncilOrchestrator } from "../server/orchestration/council.js";
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
});
