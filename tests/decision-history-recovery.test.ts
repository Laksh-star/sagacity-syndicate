import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { recoverableDecisionHistory } from "../server/logging/decision-history.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const scroll = {
  decision: "Run a bounded pilot.",
  rationale: "A pilot creates evidence before commitment.",
  forethought: "Protect the downside before scaling.",
  quickaction: "Start a one-week test today.",
  examiner: "Test whether the choice is falsely binary.",
  triggerToReconvene: "Reconvene after the first measured result.",
  confidence: 0.78,
};

describe("local decision log recovery", () => {
  it("recovers verified results while skipping failed and damaged lines", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sagacity-history-"));
    temporary.push(directory);
    const path = join(directory, "deliberations.jsonl");
    await writeFile(path, [
      "not-json",
      JSON.stringify({ at: "2026-09-16T00:00:00.000Z", deliberationId: "failed", conversationRevision: 1, deliberationRevision: 1, event: "council.error", data: { message: "failed" } }),
      JSON.stringify({ at: "2026-09-16T00:01:00.000Z", deliberationId: "verified", conversationRevision: 2, deliberationRevision: 1, event: "council.result", data: { mode: "initial", scroll } }),
    ].join("\n"), "utf8");

    const recovered = await recoverableDecisionHistory(10, pathToFileURL(path));
    expect(recovered).toEqual([expect.objectContaining({
      deliberationId: "verified",
      conversationRevision: 2,
      deliberationRevision: 1,
      roundMode: "initial",
      scroll,
    })]);
  });
});
