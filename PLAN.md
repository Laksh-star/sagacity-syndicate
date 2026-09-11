# Sagacity Syndicate — implementation plan

Status: implemented and locally verified on 2026-09-11

## Product boundary

Build a local-first browser proof of concept in TypeScript. GPT-Live-1 is the spoken moderator (Sutradhara); the application server owns deliberation state and runs three OpenAI Agents API specialists. The UI exposes the transcript, council state, and a structured Decision Scroll without showing private chain-of-thought or raw internal model output.

## Documentation baseline (verified 2026-09-11)

- GPT-Live browser apps use WebRTC. A trusted server exchanges the browser SDP offer with `POST /v1/live/sessions`; the API key remains server-side. The client waits for `session.started` before sending commands.
- `gpt-live-1` supports client delegation. The app receives `session.delegation.created`, builds task context from transcript/application state, runs its own backend, and returns concise results with `session.commentary.append` using the delegation ID.
- Interrupting GPT-Live speech does not automatically cancel backend work. The app must own cancellation/staleness policy.
- The current JavaScript Agents API surface is `client.beta.agents.sessions.create(...)`. A session can be continued by posting input events, and a running turn can be cancelled with `agent.session.input.cancel`.
- Independent work can run concurrently. The council will use application-controlled concurrency so agent identity, phase order, retries, and UI states stay deterministic.

Official references:

- [Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [GPT-Live delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client)
- [GPT-Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
- [Agents API sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [Agents API multi-agent](https://developers.openai.com/api/docs/guides/agents-api/multi-agent)

## Proposed stack

- Node.js 22 + TypeScript
- React + Vite for the browser UI
- Express for the trusted local server and static production build
- Official `openai` JavaScript SDK for GPT-Live and Agents API calls
- Zod for final Decision Scroll validation
- Vitest for orchestration/state tests
- JSONL files under `logs/` for append-only deliberation diagnostics; raw logs are gitignored

## Module layout

```text
sagacity-syndicate/
  client/
    components/        # voice control, transcript, agent cards, Decision Scroll
    voice/             # WebRTC/session event adapter only
    state/             # reducer and stale-round handling
  server/
    agents/            # Agents API session adapter and output parsing
    orchestration/     # state machine, Impact Router, rounds, synthesis
    live/              # GPT-Live session creation/config
    logging/           # JSONL round logger
  prompts/
    sutradhara.md
    forethought.md
    quickaction.md
    examiner.md
    impact-router.md
    cross-examination.md
    synthesis.md
  shared/
    schemas.ts
    events.ts
  tests/
  .env.example
  README.md
```

## Deliberation lifecycle

1. Sutradhara gathers only missing decision context and delegates when the decision, objective, hard constraints, and time horizon are adequate.
2. The browser sends the current transcript, normalized context, previous Decision Scroll (if any), and two monotonically increasing revisions: `conversationRevision` for transcript/constraint changes and `deliberationRevision` for council runs.
3. First pass: Forethought, Quickaction, and Examiner run independently with `Promise.allSettled` in separate Agents API sessions.
4. Cross-examination: each specialist receives the other two concise outputs in its existing session and produces one bounded critique. These three continuations run concurrently.
5. Every specialist opinion and critique is parsed against a bounded Zod schema before it can advance the state machine. Invalid output gets one repair attempt, then the round fails visibly.
6. Synthesis: a dedicated synthesis call produces strict structured output:
   - `DECISION`
   - `RATIONALE`
   - `FORETHOUGHT`
   - `QUICKACTION`
   - `EXAMINER`
   - `TRIGGER TO RECONVENE`
   - `CONFIDENCE`
7. The UI validates and renders the Decision Scroll. Quiet progress and decision context use `session.thinking.append`; only the concise speakable synthesis uses `session.commentary.append`. Both carry the matching delegation ID and remain under the documented 500-token append limit.

## Interruptions and changed constraints

- Push-to-talk controls microphone track state. GPT-Live remains interruption-capable.
- `conversationRevision` changes whenever accepted conversation context changes. `deliberationRevision` changes only when a new council run begins. A result is publishable only when both captured revisions still match current state.
- Every deliberation has an `AbortController`. New material input cancels known Agents API turns where possible and makes late results ineligible for rendering or speech.
- A separate Impact Router evaluates changed constraints against the prior decision and returns a bounded materiality/affected-agent result. Material changes rerun only the selected specialists; non-material changes preserve the existing scroll.
- If impact is ambiguous, fail safe by rerunning all three. UI labels whether the result is a full or selective reconvening.

## Council state machine

`idle -> clarifying -> ready -> routing? -> independent -> cross_examining -> synthesizing -> completed`

- `routing` occurs only for reconvening.
- `independent`, `cross_examining`, and `synthesizing` may transition to `interrupted` or `failed`.
- `interrupted -> ready` after accepting the new context; `failed -> ready` permits an explicit retry.
- Illegal transitions are rejected and logged. Agent-card states are projections of council state plus per-agent phase, not independent UI guesses.

## Bounded structured schemas

- Specialist opinion: stance (max 240 chars), observations (1–4 items, max 220 chars each), recommendation (max 300 chars), confidence (0–1), uncertainties (0–3 items).
- Critique: target agent, agreements (0–2), challenges (1–3), revision advice (max 280 chars), severity (`low | medium | high`).
- Impact Router: material boolean, affected agents (unique subset of the three), reason (max 280 chars), preserved fields, confidence (0–1). Ambiguous or invalid routing expands to all agents.
- Decision Scroll: all seven required fields with explicit length bounds and confidence in `[0,1]`.

## UI scope

- One large hold/tap-to-talk control with connected/listening/speaking/interrupted states
- Live transcript with clear User/Sutradhara attribution
- Three compact agent cards: waiting, thinking, challenging, done, error
- Decision Scroll panel with the seven required fields
- Small text-input fallback for local development and accessibility
- Minimal visual system inspired by paper, ink, and forest colors; no decorative animation beyond state feedback

## API and state boundaries

- `POST /api/live/session`: validates same-origin request and exchanges SDP for a GPT-Live client-delegation session.
- `POST /api/deliberations`: starts or reconvenes a council round and streams typed server-sent events for card states and the final scroll.
- `POST /api/deliberations/:id/interrupt`: marks the revision stale and requests cancellation of active Agents API turns.
- The API key is read only from `OPENAI_API_KEY`; model choices come from `OPENAI_LIVE_MODEL`, `OPENAI_COUNCIL_MODEL`, and `OPENAI_SYNTHESIS_MODEL` with documented defaults.

## Verification

- Unit tests for legal/illegal state transitions, both revision counters, prompt loading, every structured-output schema, selective rerun routing, stale-result suppression, and JSONL log shape
- Mocked integration test proving three independent runs start before any completes, followed by three concurrent cross-exams and synthesis
- Browser smoke test for text fallback and mocked voice events
- Production build and TypeScript checks
- Implement and verify the complete text-first path through reconvening before adding GPT-Live.
- Optional live smoke test only when a valid local `OPENAI_API_KEY` is already available; no key will be printed or committed
- Rendered UI inspection at desktop and narrow viewport sizes

## Known proof-of-concept limits

- Local single-user state; no authentication or database
- JSONL debug logs may contain decision content and should be treated as sensitive
- GPT-Live and Agents API are access- and billing-dependent; mock mode will validate the complete UI/orchestration path without claiming live API success
- Selective rerun is conservative: ambiguous changes cause a full reconvening

## Acceptance criteria

- The user can speak or type a decision, answer concise clarification, and receive the required structured Decision Scroll.
- All three visible agent cards accurately reflect the independent and challenge phases.
- A new constraint can interrupt an active round; stale output never replaces the newest revision.
- A post-decision material constraint triggers a selective or conservative full reconvening with an audit record.
- Prompts, voice logic, orchestration, schemas, model configuration, and logging are cleanly separated.
- README setup works from a clean checkout, and tests/build pass without requiring an API key.

## Verification record

- Text-first initial deliberation: visibly completed in the production browser build.
- Material budget change: Impact Router selected a selective reconvening; the UI reached `completed` at conversation/deliberation revisions `2/2`.
- Browser console: no errors or warnings during the exercised flow.
- Automated checks: TypeScript passed; 9 tests passed, including real overlap of three backend calls and interrupted-revision invalidation; production Vite build passed.
- GPT-Live code path: implemented against the current WebRTC/client-delegation contract but not live-smoke-tested because `OPENAI_API_KEY` was not present. No live-access claim is made.
