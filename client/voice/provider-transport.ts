export type VoiceProvider = "openai" | "foundry";

export type VoiceAppendKind = "thinking" | "commentary" | "instructions";

export type ProviderEvent = {
  type: string;
  delta?: string;
  event_id?: string;
  client_event_id?: string;
  start_ms?: number;
  end_ms?: number;
  offset_ms?: number;
  delegation?: { id: string; target: string };
  session?: { id: string };
  item_id?: string;
  transcript?: string;
  sdp_answer?: string;
  response_id?: string;
  response?: { id?: string; status?: string };
  item?: { id?: string };
  error?: { message?: string; client_event_id?: string };
};

export type VoiceTransportEvent =
  | { type: "ready"; sessionId?: string }
  | { type: "session-id"; sessionId?: string }
  | { type: "closed" }
  | { type: "user-transcript-delta"; text: string; startMs: number; endMs: number }
  | { type: "user-transcript-final"; itemId: string; text: string; atMs: number }
  | { type: "assistant-transcript-delta"; text: string; startMs: number; endMs: number }
  | { type: "assistant-completed"; exactTranscript?: string }
  | { type: "delegation"; id: string; offsetMs: number }
  | { type: "input-muted"; turnId?: string }
  | { type: "append-acknowledged"; kind: VoiceAppendKind; clientEventId?: string }
  | { type: "error"; message: string; clientEventId?: string }
  | { type: "response-created"; responseId?: string }
  | { type: "audio-started"; responseId?: string };

export type VoiceTransportSink = (event: VoiceTransportEvent) => void;

export type TalkStart = {
  completeCurrentUserTurn: boolean;
  startedAt?: number;
};

export interface VoiceTransport {
  readonly kind: VoiceProvider;
  readonly keepEmptyUserTurnOpen: boolean;
  connect(peer: RTCPeerConnection): Promise<void>;
  isReady(): boolean;
  beginTalking(): TalkStart;
  activateTalking(): void;
  endTalking(activeTurnId?: string): void;
  append(kind: VoiceAppendKind, content: string, delegationId: string | null): string;
  close(): void;
}

export type VoiceTransportFactory = (provider: VoiceProvider, sink: VoiceTransportSink) => VoiceTransport;
