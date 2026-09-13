import { describe, expect, it } from "vitest";
import { SerialTaskQueue } from "../client/voice/serial-task-queue.js";
import { createLiveSessionBootstrap } from "../client/voice/session-bootstrap.js";
import { DecisionScrollSchema } from "../shared/schemas.js";

const scroll = DecisionScrollSchema.parse({
  decision: "Run a four-week pilot.",
  rationale: "A narrow test limits downside.",
  forethought: "Protect against recurring costs.",
  quickaction: "Choose one audience.",
  examiner: "A portal is not a durable advantage.",
  triggerToReconvene: "Reconvene after four weeks.",
  confidence: 0.88,
});

describe("voice session continuity", () => {
  it("seeds a refreshed Live session with the restored verified decision", () => {
    const bootstrap = createLiveSessionBootstrap(scroll);
    expect(bootstrap.status).toBe("COMPLETED");
    expect(bootstrap.thinkingContext).toContain("Decision: Run a four-week pilot.");
    expect(bootstrap.thinkingContext).toContain("The full Decision Scroll is visible");
    expect(bootstrap.statusDetail).toContain("Do not ask the user to restate");
  });

  it("does not seed decision context when no verified Scroll exists", () => {
    const bootstrap = createLiveSessionBootstrap();
    expect(bootstrap.status).toBe("NOT_STARTED");
    expect(bootstrap.thinkingContext).toBeUndefined();
  });

  it("processes completed turns in arrival order even when the first assessment is slower", async () => {
    const queue = new SerialTaskQueue();
    const order: string[] = [];
    const first = queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      order.push("deadline-change");
    });
    const second = queue.enqueue(async () => {
      order.push("prior-context-reference");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["deadline-change", "prior-context-reference"]);
  });

  it("continues with later turns after one queued task fails", async () => {
    const queue = new SerialTaskQueue();
    await expect(queue.enqueue(() => { throw new Error("classification failed"); })).rejects.toThrow("classification failed");
    await expect(queue.enqueue(() => "next turn")).resolves.toBe("next turn");
  });
});
