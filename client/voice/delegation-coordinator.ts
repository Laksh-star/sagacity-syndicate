export type NativeDelegationClaim = "start" | "bind" | "duplicate";

/** Keeps native and fallback handoffs idempotent when their events race. */
export class VoiceDelegationCoordinator {
  private readonly starts = new Map<string, "native" | "fallback">();
  private readonly nativeIds = new Map<string, string>();

  claimNative(turnId: string, delegationId: string): NativeDelegationClaim {
    if (this.nativeIds.get(turnId) === delegationId) return "duplicate";
    this.nativeIds.set(turnId, delegationId);
    const source = this.starts.get(turnId);
    if (!source) {
      this.starts.set(turnId, "native");
      return "start";
    }
    return source === "fallback" ? "bind" : "duplicate";
  }

  claimFallback(turnId: string): boolean {
    if (this.starts.has(turnId) || this.nativeIds.has(turnId)) return false;
    this.starts.set(turnId, "fallback");
    return true;
  }

  sourceFor(turnId: string): "native" | "fallback" | undefined {
    return this.starts.get(turnId);
  }
}

/** Allows only one unresolved initial council handoff across multiple turns. */
export class InitialHandoffGate {
  private pendingTurnId?: string;

  reserve(turnId: string): boolean {
    if (this.pendingTurnId && this.pendingTurnId !== turnId) return false;
    this.pendingTurnId = turnId;
    return true;
  }

  replace(turnId: string): string | undefined {
    const previous = this.pendingTurnId;
    this.pendingTurnId = turnId;
    return previous;
  }

  isCurrent(turnId: string): boolean {
    return this.pendingTurnId === turnId;
  }

  isReservedForOther(turnId: string): boolean {
    return Boolean(this.pendingTurnId && this.pendingTurnId !== turnId);
  }

  clear(turnId: string): void {
    if (this.pendingTurnId === turnId) this.pendingTurnId = undefined;
  }
}
