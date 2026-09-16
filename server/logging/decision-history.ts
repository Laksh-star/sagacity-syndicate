import { readFile } from "node:fs/promises";
import { z } from "zod";
import { CouncilTraceSchema, DecisionScrollSchema } from "../../shared/schemas.js";

const ResultSchema = z.object({
  at: z.string().datetime(),
  deliberationId: z.string().trim().min(1).max(100),
  conversationRevision: z.number().int().nonnegative(),
  deliberationRevision: z.number().int().nonnegative(),
  event: z.literal("council.result"),
  data: z.object({
    mode: z.enum(["initial", "selective", "full", "preserved"]),
    scroll: DecisionScrollSchema,
    trace: CouncilTraceSchema.optional(),
  }).passthrough(),
}).passthrough();

export async function recoverableDecisionHistory(
  limit = 10,
  source = new URL("../../logs/deliberations.jsonl", import.meta.url),
) {
  try {
    const raw = await readFile(source, "utf8");
    const entries = new Map<string, z.infer<typeof ResultSchema>>();
    for (const line of raw.split("\n")) {
      if (!line.includes('"event":"council.result"')) continue;
      try {
        const parsed = ResultSchema.safeParse(JSON.parse(line));
        if (!parsed.success) continue;
        entries.set(`${parsed.data.deliberationId}:${parsed.data.deliberationRevision}`, parsed.data);
      } catch { /* Ignore a damaged log line and continue recovering later results. */ }
    }
    return [...entries.values()].slice(-Math.max(0, Math.min(limit, 10))).map((entry) => ({
      deliberationId: entry.deliberationId,
      conversationRevision: entry.conversationRevision,
      deliberationRevision: entry.deliberationRevision,
      roundMode: entry.data.mode,
      scroll: entry.data.scroll,
      trace: entry.data.trace,
    }));
  } catch {
    return [];
  }
}
