import type { CouncilRevision } from "./council-lifecycle.js";

export type LiveAppendKind = "thinking" | "commentary" | "instructions";
export type PendingLiveAppend = { kind: LiveAppendKind; revision?: CouncilRevision; delegationId: string | null };

export class LiveAppendTracker {
  private readonly pending = new Map<string, PendingLiveAppend>();

  register(eventId: string, append: PendingLiveAppend): void {
    this.pending.set(eventId, append);
  }

  acknowledge(eventId: string): PendingLiveAppend | undefined {
    const append = this.pending.get(eventId);
    if (append) this.pending.delete(eventId);
    return append;
  }
}
