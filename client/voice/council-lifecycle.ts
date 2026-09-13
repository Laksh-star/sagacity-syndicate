import type { DecisionScroll } from "../../shared/schemas.js";

export type CouncilRevision = { conversationRevision: number; deliberationRevision: number };
export type ActiveVoiceRound = CouncilRevision & {
  delegationId: string | null;
  causalTurnId?: string;
  reconvening: boolean;
};

export class VoiceCouncilLifecycle {
  private active?: ActiveVoiceRound;
  private verified?: { revision: CouncilRevision; scroll: DecisionScroll };

  startRound(round: ActiveVoiceRound): void {
    this.active = { ...round };
  }

  activeRound(): ActiveVoiceRound | undefined {
    return this.active ? { ...this.active } : undefined;
  }

  bindDelegation(delegationId: string, causalTurnId: string): boolean {
    if (!this.active || this.active.delegationId) return false;
    this.active = { ...this.active, delegationId, causalTurnId };
    return true;
  }

  verifiedResult(): { revision: CouncilRevision; scroll: DecisionScroll } | undefined {
    return this.verified ? { revision: { ...this.verified.revision }, scroll: this.verified.scroll } : undefined;
  }

  restoreVerifiedResult(revision: CouncilRevision, scroll: DecisionScroll): void {
    if (this.active) return;
    this.verified = { revision: { ...revision }, scroll };
  }

  isCausalTurn(turnId: string): boolean {
    return this.active?.causalTurnId === turnId;
  }

  isCurrent(revision: CouncilRevision): boolean {
    return this.active?.conversationRevision === revision.conversationRevision
      && this.active?.deliberationRevision === revision.deliberationRevision;
  }

  acceptResult(revision: CouncilRevision, scroll: DecisionScroll): boolean {
    if (!this.isCurrent(revision)) return false;
    this.verified = { revision: { ...revision }, scroll };
    this.active = undefined;
    return true;
  }

  endIfCurrent(revision: CouncilRevision): void {
    if (this.isCurrent(revision)) this.active = undefined;
  }
}
