# Voice lifecycle implementation note

> Historical design note. This file records the failure analysis that drove the voice redesign. The fixes described here are implemented. Current architecture, including confirmation-gated corrections and confidence calibration, is documented in [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/BEHIND_THE_SCENES.md](docs/BEHIND_THE_SCENES.md).

## Root cause

The original `LiveVoiceSession` emitted every `session.input_transcript.delta` as a standalone transcript row. `App` treated every emitted user fragment during an active council phase as a new interruption, incremented the conversation revision, requested Agents API cancellation, aborted the response stream, and moved the UI to `interrupted`. A delayed fragment from the same utterance that caused `session.delegation.created` could therefore cancel its own council round after Sutradhara had already acknowledged delegation.

The fragment-cancellation path has since been repaired, but live diagnostics exposed a second handoff failure: a voice model can conversationally say that it is delegating without an authoritative application start. The first repair used a readiness fallback. The later cross-provider design deliberately replaced automatic start with an application-owned, schema-bounded readiness check, captured-question read-back, and explicit approval. OpenAI delegation metadata is bound to that approved start when available; Foundry does not synthesize it. Neither provider can start duplicate work merely through speech.

## Authoritative user-turn boundary

GPT-Live transcript delta events do not define complete turns. The implemented push-to-talk path uses release as the application boundary, sends `session.input_audio.mute`, waits for its acknowledgement and a short transcript-settle interval, then finalizes the aggregated user turn. Delegation `offset_ms` binds the latest causal user turn to that delegation. A late fragment whose source interval predates that offset updates the causal turn and can never cancel the council.

## Durable result versus speech

The validated `DecisionScroll` remains the only authoritative decision artifact and is rendered in full in the UI. A deterministic, bounded `VoiceBrief` is derived from that Scroll for the short spoken handoff. GPT-Live receives compact verified Scroll facts through `session.thinking.append` for later questions and receives only Voice Brief facts plus delivery instructions through `session.commentary.append`.

## State changes

The server council keeps its revision-safe orchestration phases. The client adds explicit voice-turn, delegation, append-acknowledgement, materiality, and `confirming_constraint` state. Product presentation derives conversation, deliberating, confirming, completed, and reconvening modes. A completed post-delegation utterance is assessed before cancellation; non-material follow-ups remain conversational, material speech is reflected and must be confirmed before cancellation or reconvening, and ambiguous changes preserve current work until clarified. Every UI and Live result write is gated by captured conversation and deliberation revisions.

The intake presentation also tracks `ready`, `listening`, `captured`, `clarifying`, and `preparing`. These states come from application events, not from Sutradhara's words. Voice mode reads back a ready decision and waits for explicit approval; text mode retains the explicit Convene action. Verified completion is returned through the selected provider's bounded quiet-context and spoken-commentary paths.

Only one initial capture may be pending across the whole voice intake, not merely per transcript turn. This prevents two readiness calls or delegation events from starting overlapping rounds. If the approving turn has an OpenAI delegation, it takes precedence; otherwise the stored decision-turn delegation is used. The server also converts any unexpectedly superseded active phase through `interrupted → ready` before starting the newer revision, so a provider or client race cannot create an `independent → independent` transition.

## Current implementation status

- Transcript fragments aggregate into one visible turn.
- Native OpenAI delegation is bound to its causal completed turn when emitted.
- Both providers require one explicit approval before the initial council starts.
- OpenAI and Foundry voice protocols are isolated behind a shared transport interface.
- OpenAI Agents sessions and Foundry Responses calls implement the same council runtime contract.
- The full Scroll and short Voice Brief use separate output paths.
- Material corrections require durable confirmation, including old/new direction when available.
- Pending confirmation survives refresh without provider identifiers.
- Recommendation confidence is capped at 0.85 while key evidence remains unverified.
- The consolidated automated gate is 34 test files / 186 tests plus typecheck, public-candidate hygiene, and production build.

## Documentation checked

Official OpenAI documentation rechecked on 27 September 2026:

- [GPT-Live overview](https://developers.openai.com/api/docs/guides/live)
- [Client delegation](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client)
- [WebRTC transport](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Agents API sessions and cancellation](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [Agents API session management](https://developers.openai.com/api/docs/guides/agents-api/sessions/manage)
