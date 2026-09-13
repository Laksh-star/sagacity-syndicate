# Voice lifecycle implementation note

## Root cause

`LiveVoiceSession` currently emits every `session.input_transcript.delta` as a standalone transcript row. `App` treats every emitted user fragment during an active council phase as a new interruption, increments the conversation revision, requests Agents API cancellation, aborts the response stream, and moves the UI to `interrupted`. A delayed fragment from the same utterance that caused `session.delegation.created` can therefore cancel its own council round after Sutradhara has already acknowledged delegation.

The fragment-cancellation path has since been repaired, but live diagnostics exposed a second handoff failure: GPT-Live can conversationally say that it is delegating without emitting `session.delegation.created`. In client-delegation mode the application owns the backend path, and speech is not an authoritative work event. The UI therefore remained at `waiting` because no council request had actually started. The fix is an application-owned, schema-bounded readiness check followed by a short native-delegation grace period and an idempotent fallback start. Native delegation remains preferred and may bind to a fallback round if it arrives late, but it can never start a duplicate round.

## Authoritative user-turn boundary

GPT-Live's current public event contract has transcript delta events but no completed input-transcript event. Deltas explicitly do not define complete turns. This push-to-talk UI will therefore use the user's release as the application turn boundary, send `session.input_audio.mute`, wait for its acknowledgement and a short transcript-settle interval, then finalize the aggregated user turn. Delegation `offset_ms` binds the latest causal user turn to that delegation. A late fragment whose source interval predates that offset updates the causal turn and can never cancel the council.

## Durable result versus speech

The validated `DecisionScroll` remains the only authoritative decision artifact and is rendered in full in the UI. A deterministic, bounded `VoiceBrief` is derived from that Scroll for the short spoken handoff. GPT-Live receives compact verified Scroll facts through `session.thinking.append` for later questions and receives only Voice Brief facts plus delivery instructions through `session.commentary.append`.

## State changes

The server council keeps its revision-safe orchestration phases. The client adds explicit voice-turn, delegation, append-acknowledgement, and materiality state. Product presentation derives four modes: conversation, deliberating, completed, and reconvening. A completed post-delegation utterance is assessed for materiality before cancellation; non-material follow-ups remain conversational, material changes cancel and reconvene, and ambiguous changes preserve current work until clarified. Every UI and Live result write is gated by the captured conversation and deliberation revisions.

The intake presentation also tracks `ready`, `listening`, `captured`, `clarifying`, and `preparing`. These states come from application events, not from Sutradhara's words. Voice mode automatically hands a ready decision to the council; text mode retains the explicit Convene action. Verified completion is returned through both Live channels even when a fallback round has no delegation ID, using the documented `delegation_id: null` session-context path.

Only one initial handoff may be pending across the whole voice intake, not merely per transcript turn. This prevents two readiness calls completing out of order from starting overlapping fallback rounds. The server also converts any unexpectedly superseded active phase through `interrupted → ready` before starting the newer revision, so a provider or client race cannot create an `independent → independent` transition.

## Documentation checked

- [GPT-Live overview](https://developers.openai.com/api/docs/guides/live)
- [Client delegation](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client)
- [WebRTC transport](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Agents API sessions and cancellation](https://developers.openai.com/api/docs/guides/agents-api/sessions)
