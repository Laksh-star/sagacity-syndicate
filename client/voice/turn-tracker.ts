export type VoiceTurn = {
  id: string;
  role: "user" | "sutradhara";
  text: string;
  startedAt?: number;
  completedAt?: number;
  complete: boolean;
};

export type TranscriptDelta = {
  role: VoiceTurn["role"];
  text: string;
  startMs: number;
  endMs: number;
};

export type DelegationBinding = {
  id: string;
  offsetMs: number;
  causalTurnId?: string;
};

type TrackedTurn = VoiceTurn & { endMs?: number };

const snapshot = ({ endMs: _endMs, ...turn }: TrackedTurn): VoiceTurn => ({ ...turn });

export class VoiceTurnTracker {
  private readonly turns: TrackedTurn[] = [];
  private readonly delegationBindings = new Map<string, DelegationBinding>();
  private sequence = 0;
  private activeUserId?: string;
  private activeAssistantId?: string;

  beginUserTurn(startedAt?: number): VoiceTurn {
    const existing = this.activeUserId && this.find(this.activeUserId);
    if (existing && !existing.complete) this.complete(existing, startedAt);
    const turn = this.create("user", startedAt);
    this.activeUserId = turn.id;
    return snapshot(turn);
  }

  acceptDelta(delta: TranscriptDelta): { updated: VoiceTurn; completed: VoiceTurn[] } {
    const completed: VoiceTurn[] = [];
    if (delta.role === "user") {
      const assistant = this.activeAssistantId && this.find(this.activeAssistantId);
      if (assistant && !assistant.complete) completed.push(snapshot(this.complete(assistant, delta.startMs)));
      this.activeAssistantId = undefined;
    } else {
      const user = this.activeUserId && this.find(this.activeUserId);
      if (user && !user.complete) completed.push(snapshot(this.complete(user, delta.startMs)));
      this.activeUserId = undefined;
    }

    let turn = delta.role === "user"
      ? this.activeUserId && this.find(this.activeUserId)
      : this.activeAssistantId && this.find(this.activeAssistantId);
    if (!turn && delta.role === "user") turn = this.lateUserTurn(delta.startMs);
    if (!turn) turn = this.create(delta.role, delta.startMs);

    turn.text += delta.text;
    turn.startedAt = Math.min(turn.startedAt ?? delta.startMs, delta.startMs);
    turn.endMs = Math.max(turn.endMs ?? delta.endMs, delta.endMs);
    if (delta.role === "user" && !turn.complete) this.activeUserId = turn.id;
    if (delta.role === "sutradhara" && !turn.complete) this.activeAssistantId = turn.id;
    return { updated: snapshot(turn), completed };
  }

  completeUserTurn(completedAt?: number): VoiceTurn | undefined {
    const turn = this.activeUserId && this.find(this.activeUserId);
    this.activeUserId = undefined;
    return turn && !turn.complete ? snapshot(this.complete(turn, completedAt ?? turn.endMs)) : undefined;
  }

  completeAssistantTurn(completedAt?: number): VoiceTurn | undefined {
    const turn = this.activeAssistantId && this.find(this.activeAssistantId);
    this.activeAssistantId = undefined;
    return turn && !turn.complete ? snapshot(this.complete(turn, completedAt ?? turn.endMs)) : undefined;
  }

  bindDelegation(id: string, offsetMs: number): DelegationBinding {
    const candidates = this.turns.filter((turn) => turn.role === "user" && (turn.startedAt ?? 0) <= offsetMs + 1_000);
    const causal = (this.activeUserId ? this.find(this.activeUserId) : undefined) ?? candidates.at(-1);
    const binding = { id, offsetMs, causalTurnId: causal?.id };
    this.delegationBindings.set(id, binding);
    return binding;
  }

  turnForDelegation(id: string): VoiceTurn | undefined {
    const turnId = this.delegationBindings.get(id)?.causalTurnId;
    const turn = turnId ? this.find(turnId) : undefined;
    return turn ? snapshot(turn) : undefined;
  }

  isCausalTurn(turnId: string, delegationId: string): boolean {
    return this.delegationBindings.get(delegationId)?.causalTurnId === turnId;
  }

  list(): VoiceTurn[] {
    return this.turns.map(snapshot);
  }

  private create(role: VoiceTurn["role"], startedAt?: number): TrackedTurn {
    const turn: TrackedTurn = { id: `voice_turn_${this.sequence++}`, role, text: "", startedAt, complete: false };
    this.turns.push(turn);
    return turn;
  }

  private find(id: string): TrackedTurn | undefined {
    return this.turns.find((turn) => turn.id === id);
  }

  private lateUserTurn(startMs: number): TrackedTurn | undefined {
    const turn = [...this.turns].reverse().find((candidate) => candidate.role === "user");
    if (!turn?.complete || turn.endMs === undefined || startMs > turn.endMs + 1_000) return undefined;
    return turn;
  }

  private complete(turn: TrackedTurn, completedAt?: number): TrackedTurn {
    turn.complete = true;
    turn.completedAt = completedAt;
    return turn;
  }
}
