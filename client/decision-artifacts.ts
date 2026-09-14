import type { DecisionScroll } from "../shared/schemas.js";
import type { DecisionHistoryEntry } from "./persisted-decision.js";
import type { VoiceTurn } from "./voice/live-session.js";

export type DecisionField = keyof DecisionScroll;
export type DecisionComparisonRow = {
  field: DecisionField;
  label: string;
  initial: string;
  revised: string;
  changed: boolean;
};

const fields: Array<{ field: DecisionField; label: string }> = [
  { field: "decision", label: "Decision" },
  { field: "rationale", label: "Rationale" },
  { field: "forethought", label: "Forethought" },
  { field: "quickaction", label: "Quickaction" },
  { field: "examiner", label: "Examiner" },
  { field: "triggerToReconvene", label: "Trigger to reconvene" },
  { field: "confidence", label: "Confidence" },
];

function displayValue(scroll: DecisionScroll, field: DecisionField): string {
  const value = scroll[field];
  return field === "confidence" ? `${Math.round(Number(value) * 100)}%` : String(value);
}

export function compareDecisionScrolls(initial: DecisionScroll, revised: DecisionScroll): DecisionComparisonRow[] {
  return fields.map(({ field, label }) => {
    const initialValue = displayValue(initial, field);
    const revisedValue = displayValue(revised, field);
    return { field, label, initial: initialValue, revised: revisedValue, changed: initialValue !== revisedValue };
  });
}

export function decisionToMarkdown(entry: DecisionHistoryEntry): string {
  const { scroll } = entry;
  return [
    "# Sagacity Syndicate — Decision Scroll",
    "",
    `- Saved: ${entry.savedAt}`,
    `- Round: ${entry.roundMode}`,
    `- Revisions: conversation ${entry.conversationRevision}, deliberation ${entry.deliberationRevision}`,
    `- Confidence: ${Math.round(scroll.confidence * 100)}%`,
    "",
    "## Decision",
    "",
    scroll.decision,
    "",
    "## Rationale",
    "",
    scroll.rationale,
    "",
    "## Forethought — biggest future risk",
    "",
    scroll.forethought,
    "",
    "## Quickaction — best immediate move",
    "",
    scroll.quickaction,
    "",
    "## Examiner — hidden assumption or missing option",
    "",
    scroll.examiner,
    "",
    "## Trigger to reconvene",
    "",
    scroll.triggerToReconvene,
    "",
  ].join("\n");
}

export function decisionMarkdownFilename(entry: DecisionHistoryEntry): string {
  const date = entry.savedAt.slice(0, 10);
  return `sagacity-decision-${date}-r${entry.deliberationRevision}.md`;
}

export function downloadDecisionMarkdown(entry: DecisionHistoryEntry): void {
  const url = URL.createObjectURL(new Blob([decisionToMarkdown(entry)], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = decisionMarkdownFilename(entry);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function createTypedCorrectionTurn(text: string, now = Date.now(), id: string = crypto.randomUUID()): VoiceTurn {
  return {
    id: `typed_${id}`,
    role: "user",
    text: text.trim(),
    startedAt: now,
    completedAt: now,
    complete: true,
  };
}
