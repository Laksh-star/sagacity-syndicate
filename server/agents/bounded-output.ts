import type { z } from "zod";
import { cleanMechanicalProse } from "../../shared/text-quality.js";

type RepairableIssue = {
  code: string;
  origin?: string;
  maximum?: number | bigint;
  path: PropertyKey[];
  params?: { repair?: string; maximum?: number };
};

function valueAt(root: unknown, path: PropertyKey[]): unknown {
  let value = root;
  for (const segment of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<PropertyKey, unknown>)[segment];
  }
  return value;
}

function setAt(root: unknown, path: PropertyKey[], value: unknown): boolean {
  if (!path.length) return false;
  const parent = valueAt(root, path.slice(0, -1));
  if (typeof parent !== "object" || parent === null) return false;
  (parent as Record<PropertyKey, unknown>)[path.at(-1) as PropertyKey] = value;
  return true;
}

export function compactCompleteText(value: string, maximum: number): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length <= maximum) return normalized;

  const sentences = normalized.match(/[^.!?]+[.!?]+(?=\s|$)/gu) ?? [];
  let complete = "";
  for (const sentence of sentences) {
    const candidate = `${complete}${complete ? " " : ""}${sentence.trim()}`;
    if (candidate.length > maximum) break;
    complete = candidate;
  }
  if (complete) return complete;

  const prefix = normalized.slice(0, Math.max(1, maximum - 1));
  const clauseBreaks = ["; ", ": ", " — ", " – ", ", "].map((delimiter) => prefix.lastIndexOf(delimiter));
  const lastClause = Math.max(...clauseBreaks);
  const lastWord = prefix.lastIndexOf(" ");
  const safeFloor = Math.floor(maximum * 0.45);
  const cut = lastClause >= safeFloor ? lastClause : lastWord >= safeFloor ? lastWord : prefix.length;
  const bounded = prefix.slice(0, cut).replace(/[\s,:;–—-]+$/gu, "").trim();
  return `${bounded || prefix.trim().slice(0, Math.max(1, maximum - 1))}.`;
}

/**
 * Last-resort recovery after bounded provider repair turns are exhausted.
 * Only length violations and explicitly tagged mechanical prose damage are
 * eligible. Identity, enum, type, required-field, and semantic refinements
 * remain authoritative failures.
 */
export function recoverBoundedOutput<T>(outputText: string, schema: z.ZodType<T>): T | undefined {
  let candidate: unknown;
  try {
    candidate = JSON.parse(outputText);
  } catch {
    return undefined;
  }

  const initial = schema.safeParse(candidate);
  if (initial.success) return initial.data;
  const issues = [...initial.error.issues] as RepairableIssue[];
  const repairable = (issue: RepairableIssue) => issue.code === "too_big"
    || (issue.code === "custom" && ["mechanical_prose", "bounded_complete_prose"].includes(issue.params?.repair ?? ""));
  if (!issues.length || issues.some((issue) => !repairable(issue))) return undefined;

  let changed = false;
  for (const issue of issues.sort((left, right) => right.path.length - left.path.length)) {
    if (issue.code === "custom") {
      const current = valueAt(candidate, issue.path);
      if (typeof current !== "string") return undefined;
      const boundedMaximum = issue.params?.maximum;
      if (issue.params?.repair === "bounded_complete_prose" && (!Number.isSafeInteger(boundedMaximum) || (boundedMaximum as number) < 1)) return undefined;
      const cleaned = issue.params?.repair === "bounded_complete_prose"
        ? compactCompleteText(current, boundedMaximum as number)
        : cleanMechanicalProse(current);
      if (!cleaned) return undefined;
      changed = setAt(candidate, issue.path, cleaned) || changed;
      continue;
    }
    const maximum = typeof issue.maximum === "bigint" ? Number(issue.maximum) : issue.maximum;
    if (!Number.isSafeInteger(maximum) || (maximum as number) < 1) return undefined;
    const current = valueAt(candidate, issue.path);
    if (issue.origin === "string" && typeof current === "string") {
      changed = setAt(candidate, issue.path, compactCompleteText(current, maximum as number)) || changed;
    } else if (issue.origin === "array" && Array.isArray(current)) {
      changed = setAt(candidate, issue.path, current.slice(0, maximum as number)) || changed;
    } else {
      return undefined;
    }
  }

  if (!changed) return undefined;
  const recovered = schema.safeParse(candidate);
  return recovered.success ? recovered.data : undefined;
}
