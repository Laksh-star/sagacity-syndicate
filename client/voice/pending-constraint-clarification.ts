import { classifyConfirmationReply } from "../../shared/constraint-confirmation.js";

export type PendingConstraintClarification = {
  sourceText: string;
};

export type PendingConstraintClarificationResolution =
  | { kind: "none" }
  | { kind: "needs_value"; pending: PendingConstraintClarification }
  | { kind: "rejected"; pending: PendingConstraintClarification }
  | { kind: "candidate"; pending: PendingConstraintClarification; combinedText: string };

/** Keeps an ambiguous possible constraint change attached to its next turn. */
export class PendingConstraintClarificationController {
  private pending?: PendingConstraintClarification;

  current(): PendingConstraintClarification | undefined {
    return this.pending;
  }

  begin(sourceText: string): void {
    this.pending = { sourceText: sourceText.trim().slice(0, 400) };
  }

  clear(): void {
    this.pending = undefined;
  }

  resolve(replyText: string): PendingConstraintClarificationResolution {
    const pending = this.pending;
    if (!pending) return { kind: "none" };
    const reply = classifyConfirmationReply(replyText);
    if (reply === "reject") {
      this.pending = undefined;
      return { kind: "rejected", pending };
    }
    if (reply === "accept") return { kind: "needs_value", pending };
    return {
      kind: "candidate",
      pending,
      combinedText: `Possible changed constraint: ${pending.sourceText}\nUser clarification: ${replyText.trim()}`,
    };
  }
}
