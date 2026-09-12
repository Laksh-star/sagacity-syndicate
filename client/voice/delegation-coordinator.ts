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
