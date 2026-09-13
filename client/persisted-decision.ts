import { z } from "zod";
import { DecisionScrollSchema, type DecisionScroll } from "../shared/schemas.js";

const STORAGE_KEY = "sagacity-syndicate.authoritative-decision.v1";

const PersistedDecisionSchema = z.object({
  version: z.literal(1),
  deliberationId: z.string().trim().min(1).max(100),
  conversationRevision: z.number().int().nonnegative(),
  deliberationRevision: z.number().int().nonnegative(),
  roundMode: z.enum(["initial", "selective", "full", "preserved"]),
  savedAt: z.string().datetime(),
  scroll: DecisionScrollSchema,
}).strict();

export type PersistedDecision = z.infer<typeof PersistedDecisionSchema>;

type DecisionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): DecisionStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

export function loadPersistedDecision(storage = browserStorage()): PersistedDecision | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = PersistedDecisionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    storage.removeItem(STORAGE_KEY);
  } catch {
    try { storage.removeItem(STORAGE_KEY); } catch { /* Storage can be unavailable or blocked. */ }
  }
  return undefined;
}

export function persistDecision(decision: Omit<PersistedDecision, "version" | "savedAt">, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    const value = PersistedDecisionSchema.parse({ ...decision, version: 1, savedAt: new Date().toISOString() });
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedDecision(storage = browserStorage()): void {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* Storage can be unavailable or blocked. */ }
}

export function restoredDecisionContext(scroll: DecisionScroll): string {
  return [
    `Prior verified decision: ${scroll.decision}`,
    `Prior rationale: ${scroll.rationale}`,
    `Prior Forethought view: ${scroll.forethought}`,
    `Prior Quickaction view: ${scroll.quickaction}`,
    `Prior Examiner view: ${scroll.examiner}`,
  ].join("\n").slice(0, 8_000);
}
