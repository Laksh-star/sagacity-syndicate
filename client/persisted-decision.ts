import { z } from "zod";
import { CouncilTraceSchema, DecisionScrollSchema, type DecisionScroll } from "../shared/schemas.js";

const STORAGE_KEY = "sagacity-syndicate.authoritative-decision.v1";
const HISTORY_STORAGE_KEY = "sagacity-syndicate.decision-history.v1";
export const DECISION_HISTORY_LIMIT = 10;

const PersistedDecisionSchema = z.object({
  version: z.literal(1),
  deliberationId: z.string().trim().min(1).max(100),
  conversationRevision: z.number().int().nonnegative(),
  deliberationRevision: z.number().int().nonnegative(),
  roundMode: z.enum(["initial", "selective", "full", "preserved"]),
  savedAt: z.string().datetime(),
  scroll: DecisionScrollSchema,
  trace: CouncilTraceSchema.optional(),
}).strict();
export const RecoverableDecisionSchema = PersistedDecisionSchema.omit({ version: true, savedAt: true });
export type RecoverableDecision = z.infer<typeof RecoverableDecisionSchema>;

export type PersistedDecision = z.infer<typeof PersistedDecisionSchema>;

const DecisionHistorySchema = z.object({
  version: z.literal(1),
  entries: z.array(PersistedDecisionSchema).max(DECISION_HISTORY_LIMIT),
}).strict();

export type DecisionHistoryEntry = PersistedDecision;

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

export function loadDecisionHistory(storage = browserStorage()): DecisionHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      const latest = loadPersistedDecision(storage);
      return latest ? [latest] : [];
    }
    const value = JSON.parse(raw) as unknown;
    const parsed = DecisionHistorySchema.safeParse(value);
    if (parsed.success) return parsed.data.entries;
    // History is a convenience collection, not one atomic authority record.
    // Preserve individually valid entries when an older or damaged entry no
    // longer matches the current bounded schema.
    const candidates = value && typeof value === "object" && Array.isArray((value as { entries?: unknown }).entries)
      ? (value as { entries: unknown[] }).entries
      : [];
    const entries = candidates
      .map((candidate) => PersistedDecisionSchema.safeParse(candidate))
      .filter((candidate): candidate is { success: true; data: PersistedDecision } => candidate.success)
      .map((candidate) => candidate.data)
      .slice(-DECISION_HISTORY_LIMIT);
    if (entries.length) {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(DecisionHistorySchema.parse({ version: 1, entries })));
      return entries;
    }
    storage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    try { storage.removeItem(HISTORY_STORAGE_KEY); } catch { /* Storage can be unavailable or blocked. */ }
  }
  return [];
}

export function recordDecisionHistory(
  decision: Omit<PersistedDecision, "version" | "savedAt">,
  storage = browserStorage(),
): DecisionHistoryEntry[] {
  if (!storage) return [];
  try {
    const entry = PersistedDecisionSchema.parse({ ...decision, version: 1, savedAt: new Date().toISOString() });
    const key = `${entry.deliberationId}:${entry.deliberationRevision}`;
    const entries = [
      ...loadDecisionHistory(storage).filter((candidate) => `${candidate.deliberationId}:${candidate.deliberationRevision}` !== key),
      entry,
    ].slice(-DECISION_HISTORY_LIMIT);
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(DecisionHistorySchema.parse({ version: 1, entries })));
    return entries;
  } catch {
    return loadDecisionHistory(storage);
  }
}

export function clearDecisionHistory(storage = browserStorage()): void {
  try { storage?.removeItem(HISTORY_STORAGE_KEY); } catch { /* Storage can be unavailable or blocked. */ }
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
    `Prior reconvene trigger: ${scroll.triggerToReconvene}`,
    `Prior confidence: ${Math.round(scroll.confidence * 100)}%.`,
  ].join("\n").slice(0, 8_000);
}

export function reconveningDecisionContext(scroll: DecisionScroll, latestContext: string): string {
  const prior = restoredDecisionContext(scroll);
  const heading = "\n\nCurrent conversation and changed constraint:\n";
  const available = Math.max(0, 8_000 - prior.length - heading.length);
  const latest = available > 0 ? latestContext.trim().slice(-available) : "";
  return latest ? `${prior}${heading}${latest}` : prior;
}
