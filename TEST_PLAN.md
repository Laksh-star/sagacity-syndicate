# Sagacity Syndicate Test Plan

This plan separates deterministic automated checks, mock browser testing, live Agents API testing, and real GPT-Live voice validation. Do not treat mock-mode success as proof of account access, microphone behavior, or audible output.

## 1. Prerequisites

- Node.js 22.6 or later.
- Dependencies installed with `npm install`.
- A clean local `.env` copied from `.env.example`.
- For live testing, an OpenAI project with access to the configured Live and Agents API models.
- Chrome or Edge with microphone access allowed for the local application.

Never paste an API key into screenshots, terminal output, issue reports, or committed files.

## 2. Automated regression suite

Run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Pass criteria:

- TypeScript reports no errors.
- All tests pass, including orchestration supersession, transcript aggregation, materiality, Voice Brief bounds, and stale-result suppression.
- Vite produces the production bundle.
- Git reports no whitespace errors.

## 3. Mock-mode browser test

Set:

```dotenv
MOCK_COUNCIL=true
```

Run `npm run dev` and open [http://localhost:5173](http://localhost:5173).

### M1 — Initial hierarchy

1. Load the page.
2. Inspect the conversation panel, council cards, and empty Scroll.

Expected:

- Mode reads **conversation**.
- Voice control and decision context are prominent.
- All three cards are waiting.
- The empty Scroll is compact and does not dominate the page.

### M2 — Text-first deliberation

1. Enter a complete decision context.
2. Select **Convene the council**.

Expected:

- Mode becomes **deliberating**.
- Headline reads **The council is deliberating**.
- Cards accurately move through thinking, challenging, and done.
- Phases occur in order: independent, cross-examining, synthesizing, completed.
- A complete Decision Scroll appears.

### M3 — Completed hierarchy

Expected after M2:

- Recommendation and confidence are prominent.
- Three compact specialist summaries are visible.
- **View full Decision Scroll** expands to all seven fields.
- The UI invites the user to ask Sutradhara about the result.

### M4 — Manual reconvening

1. Enter `The budget is now ₹20,000 instead of ₹50,000.`
2. Select **Reconvene**.

Expected:

- Mode reads **reconvening**.
- The changed fact is visible.
- The previous verified Scroll remains visible and is labeled as prior.
- The Impact Router reports selective, full, or preserved handling.
- Only the newly completed revision replaces the prior Scroll.

## 4. Live Agents API test

Set `MOCK_COUNCIL=false`, configure the documented model environment variables, restart the application, and repeat M2–M4.

Expected:

- Three independent opinions overlap rather than run serially.
- Cross-examination follows independent completion.
- Synthesis produces schema-valid output.
- A material changed constraint invokes the Impact Router.
- `logs/deliberations.jsonl` records both revision numbers and ordered phases.

Also test the materiality endpoint with a non-sensitive example:

```bash
curl -sS -X POST http://127.0.0.1:8787/api/voice/interruption-assessment \
  -H 'Content-Type: application/json' \
  --data '{"utterance":"My budget is actually 8 lakh instead of 20 lakh.","currentContext":"Deciding whether to relocate for a job.","phase":"deliberating"}'
```

Expected: `material` is `true`, `changedConstraint` is concise, and confidence is between 0 and 1.

## 5. Real GPT-Live voice test

Use a normal browser with microphone permission. Keep developer tools and `logs/live-events.jsonl` available.

### V1 — Connection and one complete turn

1. Select **Start voice** and grant microphone access.
2. Hold to speak one complete decision, then release.

Expected:

- The control changes from connecting to ready.
- The transcript shows one user turn rather than many delta rows.
- Local diagnostics contain `live.session.started`, one `live.user_turn.started`, and one `live.user_turn.completed`.

### V2 — Delegation-causing trailing delta

1. Speak a decision naturally, including a small pause before the last phrase.
2. Release and let Sutradhara delegate.

Expected:

- `live.delegation.created` is bound to the causal user turn.
- A delayed fragment updates that same turn.
- No cancellation is requested for that causal turn.
- The council reaches synthesis and completion.

### V3 — Spoken result versus Scroll

Expected after V2:

- The full Decision Scroll appears in the UI.
- Quiet context is acknowledged with `live.thinking.acknowledged`.
- Briefing context is acknowledged with `live.commentary.acknowledged`.
- Sutradhara speaks approximately 20–40 seconds.
- The speech covers recommendation, reason, tension, and next step without reading all seven Scroll fields.

Record the spoken duration manually. An append acknowledgement alone does not prove correct audio playback.

### V4 — Non-material interjection during deliberation

While a council round is active, say `Okay.` and then `What are they doing?`

Expected:

- No revision invalidation.
- No `council.cancel.requested` event.
- Status response contains no fabricated conclusion.
- The existing round completes.

### V5 — Completed-decision exploration

Ask, one at a time:

1. `Why?`
2. `What did Forethought think?`
3. `Why did Quickaction disagree?`
4. `What assumption did Examiner challenge?`
5. `When should I revisit this?`

Expected:

- Answers are grounded in the visible verified Scroll.
- No new `council.started` event occurs.
- No deliberation revision increments.
- Sutradhara does not invent additional specialist analysis.

### V6 — Material change during deliberation

During an active round, say:

> My budget is actually ₹8 lakh instead of ₹20 lakh.

Expected:

- Materiality is `true` with a normalized changed constraint.
- Cancellation is requested for the active round.
- UI visibly enters reconvening.
- A newer conversation and deliberation revision starts.
- The prior round cannot render, enter quiet context, or speak if it completes late.

### V7 — Material change after completion

After a completed result, say:

> Actually, my budget is half of what I told you.

Expected:

- The existing result remains visible as the prior verified decision.
- Impact routing selects the required rerun scope.
- A new authoritative Scroll and concise Voice Brief appear after synthesis.

### V8 — Ambiguous possible change

Say something ambiguous such as `That budget might be difficult.`

Expected:

- Current work is not destroyed automatically.
- Sutradhara asks one concise clarification or preserves the possible change until confirmation.

## 6. Failure and recovery tests

### F1 — Microphone unavailable

Block microphone permission and select **Start voice**.

Expected: the application returns to offline state with an actionable permission error instead of remaining on connecting indefinitely.

### F2 — Invalid or unavailable Live model

Temporarily configure an unavailable Live model and restart.

Expected: the UI displays a bounded developer-useful error; no key or provider response body is exposed.

### F3 — Provider cancellation loses the race

Using mocks or throttling, let round N finish after round N+1 starts.

Expected: round N produces `council.stale_result.discarded` and cannot update the Scroll, thinking context, or commentary.

### F4 — Refresh during a round

Refresh the page while deliberation is active.

Expected for this proof-of-concept: the browser session resets cleanly. No partial result is presented as authoritative.

## 7. Evidence checklist

Capture the following without secrets or private decision content:

- Automated command results.
- Screenshot of deliberating state with three truthful card states.
- Screenshot of completed compact result and expanded Scroll.
- Screenshot of reconvening with the prior Scroll preserved.
- Bounded excerpts from both JSONL logs showing revisions and lifecycle event names.
- Manual note of spoken briefing duration and whether each follow-up caused a rerun.

The release passes only when automated checks pass, text-first behavior remains intact, the normal-browser voice sequence passes V1–V8, and no stale round can render or speak.
