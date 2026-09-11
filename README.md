# Sagacity Syndicate

A small Panchatantra-inspired AI Decision Council. GPT-Live-1 plays Sutradhara, the conversational moderator, while three OpenAI Agents API specialists deliberate behind the scenes:

- **Forethought** — future risks, scenarios, prevention, second-order effects
- **Quickaction** — practical immediate moves, adaptability, low-regret action
- **Examiner** — assumptions, contradictions, and missing options

The agents analyze independently, cross-examine one another, and feed a bounded synthesis called the Decision Scroll. A separate Impact Router decides which perspectives must be rerun when a constraint changes.

![Sagacity Syndicate showing a completed live Bangalore relocation decision](docs/assets/bangalore-decision-scroll.jpg)

## Quick start

Requires Node.js 22.6 or later.

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The default `.env.example` uses `MOCK_COUNCIL=true`, so the complete text-first flow works without an API key.

To use OpenAI:

```dotenv
OPENAI_API_KEY=your-project-key
MOCK_COUNCIL=false
OPENAI_LIVE_MODEL=gpt-live-1
OPENAI_COUNCIL_MODEL=gpt-6-astra
OPENAI_SYNTHESIS_MODEL=gpt-6-astra
```

Keep `.env` local. It is ignored by git and the API key is never sent to the browser. GPT-Live availability and Agents API access depend on the OpenAI project.

## Use

### Text-first

1. Enter the decision, objective, hard constraints, and time horizon.
2. Select **Convene the council**.
3. Watch each agent move through thinking, challenging, and done.
4. Add a changed constraint and select **Reconvene**. The Impact Router chooses the smallest adequate rerun set; ambiguity expands to all three agents.

### Voice

1. Configure a live API key and set `MOCK_COUNCIL=false`.
2. Select **Start voice** and allow microphone access.
3. Hold the voice control while speaking, then release.
4. Sutradhara asks only necessary clarifying questions and delegates when the context is sufficient.

Voice uses browser WebRTC. The server creates the `gpt-live-1` session with client delegation. Quiet council progress is returned with `session.thinking.append`; the verified concise decision is returned with `session.commentary.append` for Sutradhara to paraphrase.

## Architecture

```text
Browser
  ├─ text UI ───────────────┐
  └─ GPT-Live WebRTC        │ transcript + client delegation
                            ▼
Express server ── Council state machine
                    ├─ Impact Router (reconvening only)
                    ├─ independent: Forethought | Quickaction | Examiner
                    ├─ cross-examination: selected agents in parallel
                    └─ synthesis: Decision Scroll
```

Key boundaries:

- `client/voice/` owns WebRTC, microphone tracks, Live events, and Live append channels.
- `server/agents/` adapts the current `openai` SDK Agents API session/stream interface.
- `server/orchestration/` owns order, concurrency, cancellation, revisions, and selective reconvening.
- `shared/schemas.ts` contains bounded Zod contracts for opinions, critiques, routing, events, and the final scroll.
- `prompts/` keeps every role independently editable.

## Revisions and interruption

`conversationRevision` advances when accepted conversation context changes. `deliberationRevision` advances when a new council run begins. Results can be shown or spoken only when both captured revisions remain current.

User interruption asks the server to cancel known active Agents API turns and invalidates the old revision. Late results are discarded even if provider-side cancellation loses a race.

## State machine

```text
idle → clarifying → ready → [routing] → independent
  → cross_examining → synthesizing → completed

routing | independent | cross_examining | synthesizing → interrupted | failed
interrupted | failed → ready
```

The `routing` state appears only during reconvening. Agent-card states are projections of orchestration events, not locally inferred timers.

## Structured contracts

- Opinions: stance, 1–4 observations, recommendation, confidence, and up to three uncertainties.
- Critiques: critic, target agents, up to two agreements, 1–3 challenges, revision advice, and severity.
- Impact route: materiality, unique affected-agent subset, preserved fields, reason, and confidence.
- Decision Scroll: the seven required fields with explicit string limits and confidence from 0 to 1.

The Agents API receives JSON Schema output constraints and the server validates again with Zod. Invalid output receives one repair turn, then fails visibly.

## Logging and privacy

Each orchestration transition and bounded agent result is appended to `logs/deliberations.jsonl`. This is intended for local debugging and may contain sensitive decision context. The log is ignored by git; delete or redact it before sharing a project archive.

## Commands

```bash
npm run dev        # Vite UI + Express server
npm run typecheck  # TypeScript project checks
npm test           # unit and orchestration tests
npm run build      # production client build
npm start          # serve production build on 127.0.0.1:8787
```

## Proof-of-concept limits

- Single local user; no authentication or database.
- Mock mode verifies UI and orchestration semantics, not OpenAI account access.
- The Agents API deliberation path was live-tested on 2026-09-11. Microphone, delegation, and spoken-response behavior still require a separate browser voice smoke test.
- Transcript events are fragments and can contain recognition errors; the application preserves them as context instead of treating one fragment as a complete turn.

## Documentation baseline

The implementation follows the OpenAI documentation current on 2026-09-11:

- [Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [GPT-Live client delegation](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client)
- [GPT-Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
- [Run and continue Agents API sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [Agents API multi-agent guidance](https://developers.openai.com/api/docs/guides/agents-api/multi-agent)
