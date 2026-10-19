import { classifyConfirmationReply } from "../../shared/constraint-confirmation.js";
import { acceptsCapturedDecision, isVoiceNonAnswer } from "../../shared/voice-intake.js";
import type { LiveDelegation, VoiceTurn } from "./live-session.js";

export type PendingDecisionCapture = {
  question: string;
  context: string;
  causalTurnId: string;
  delegation?: LiveDelegation;
};

export type PendingDecisionCaptureResolution =
  | { kind: "none" }
  | { kind: "ignored"; capture: PendingDecisionCapture }
  | { kind: "start"; capture: PendingDecisionCapture; delegation?: LiveDelegation }
  | { kind: "restate"; capture: PendingDecisionCapture }
  | { kind: "replaced"; capture: PendingDecisionCapture };

export class PendingDecisionCaptureController {
  private capture?: PendingDecisionCapture;

  current(): PendingDecisionCapture | undefined {
    return this.capture;
  }

  set(capture: PendingDecisionCapture): void {
    this.capture = capture;
  }

  clear(): void {
    this.capture = undefined;
  }

  take(): PendingDecisionCapture | undefined {
    const capture = this.capture;
    this.capture = undefined;
    return capture;
  }

  attachDelegation(causalTurnId: string, delegation: LiveDelegation): boolean {
    if (this.capture?.causalTurnId !== causalTurnId) return false;
    // First correlation wins. Duplicate or delayed copies of the same native
    // event cannot replace the task already bound to this captured decision.
    if (!this.capture.delegation) this.capture = { ...this.capture, delegation };
    return true;
  }

  resolveTurn(turn: VoiceTurn, delegation?: LiveDelegation): PendingDecisionCaptureResolution {
    const capture = this.capture;
    if (!capture) return { kind: "none" };

    if (turn.id === capture.causalTurnId) {
      if (delegation) this.attachDelegation(turn.id, delegation);
      return { kind: "ignored", capture: this.capture ?? capture };
    }
    if (isVoiceNonAnswer(turn.text)) return { kind: "ignored", capture };

    if (acceptsCapturedDecision(turn.text)) {
      this.capture = undefined;
      return {
        kind: "start",
        capture,
        // Deliberate policy: the explicit confirmation turn is the freshest
        // task correlation; otherwise retain the original decision turn.
        delegation: delegation ?? capture.delegation,
      };
    }

    this.capture = undefined;
    return classifyConfirmationReply(turn.text) === "reject"
      ? { kind: "restate", capture }
      : { kind: "replaced", capture };
  }
}
