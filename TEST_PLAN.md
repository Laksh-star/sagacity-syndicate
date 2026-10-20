# Sagacity Syndicate Test Plan

## Voice handoff regression test

1. Select **Speak with Sutradhara**, start voice, and state a complete decision without entering written context.
2. Release the control and confirm Sutradhara reads back one captured decision.
3. Confirm that no council starts before approval. Say a clear **yes** or use the visible confirmation control.
4. Confirm the UI reaches **The council is deliberating** exactly once. On OpenAI, a confirmation-turn delegation takes precedence over a stored decision-turn delegation; on Foundry, no synthetic delegation is required.
5. Inspect `logs/live-events.jsonl`. Confirm one readiness result, one completed approval turn, at most one effective delegation binding, and exactly one `council.started` for that revision.
6. After completion, confirm the Decision Scroll renders and Sutradhara gives a concise briefing. Confirm send and acknowledgement events are correlated where the provider returns acknowledgements.
7. Repeat with a deliberately incomplete opening such as “I need help deciding.” Confirm the app remains in clarification and does not falsely show deliberating.

## Input-mode and transcript UX

1. In **Speak with Sutradhara**, confirm Decision Context is labeled optional and no primary Convene action is required.
2. Switch to **Type decision**. Confirm the text box and **Convene the council** appear and text-first mode still completes.
3. Generate more transcript turns than fit in the panel. Confirm the scrollbar appears and the view follows the newest turn while at the bottom.
4. Scroll upward, add another turn, and confirm the reader's position is preserved and **Jump to latest** appears.
5. Select **Jump to latest** and confirm the newest turn is visible.

This plan separates deterministic automated checks, mock browser testing, live
council-runtime testing, and real voice validation for both supported providers.
Do not treat mock-mode success as proof of account access, microphone behavior,
provider transport behavior, or audible output.

## 1. Prerequisites

- Node.js 22.6 or later.
- Dependencies installed with `npm ci`.
- A clean local `.env` copied from `.env.example`.
- For OpenAI live testing, a project with access to the configured GPT-Live and Agents API models.
- For Foundry live testing, a resource key, Responses-compatible endpoint and deployments, and Voice Live endpoint/model.
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
- All tests pass, including orchestration supersession, transcript aggregation, materiality, Voice Brief bounds, stale-result suppression, provider telemetry, cancellation idempotency, status reconciliation, and persisted-result validation.
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
- A synthesis that proposes confidence above 0.85 is deterministically capped at 0.85 while key evidence remains unverified.
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

## 4. Live council-runtime test

Set `MOCK_COUNCIL=false`, select one `COUNCIL_PROVIDER`, configure that
provider's documented model or deployment environment variables, restart the
application, and repeat M2–M4. Run this section once for OpenAI and once for
Foundry.

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

## 5. Real provider voice test

Select the matching `VOICE_PROVIDER`, use a normal browser with microphone
permission, and keep developer tools plus `logs/live-events.jsonl` available.
Run V1–V9 once with OpenAI and once with Foundry.

### V1 — Connection and one complete turn

1. Select **Start voice** and grant microphone access.
2. Hold to speak one complete decision, then release.

Expected:

- The control changes from connecting to ready.
- The transcript shows one user turn rather than many delta rows.
- Local diagnostics contain `live.session.started`, one `live.user_turn.started`, and one `live.user_turn.completed`.

### V2 — Approval and provider handoff

1. Speak a decision naturally, including a small pause before the last phrase.
2. Release and wait for the captured-question read-back.
3. Confirm that no council starts yet, then say **yes**.

Expected:

- Exactly one council starts after approval.
- With OpenAI, any `live.delegation.created` is bound to its causal turn and the documented confirmation-turn precedence applies.
- With Foundry, no native delegation event is required or synthesized.
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
- UI visibly enters **confirming constraint** and reflects the old/new values.
- No cancellation or deliberation revision occurs before confirmation.
- Say “yes”; cancellation is then requested for the active round.
- UI visibly enters reconvening only after confirmation.
- A newer conversation and deliberation revision starts.
- The prior round cannot render, enter quiet context, or speak if it completes late.

### V7 — Material change after completion

After a completed result, say:

> Actually, my budget is half of what I told you.

Expected:

- The existing result remains visible as the prior verified decision.
- The interpreted change requires confirmation and survives one browser refresh.
- Reject it once and verify no council rerun; restate it and confirm.
- Impact routing selects the required rerun scope.
- A new authoritative Scroll and concise Voice Brief appear after synthesis.

### V8 — Ambiguous possible change

Say something ambiguous such as `That budget might be difficult.`

Expected:

- Current work is not destroyed automatically.
- Sutradhara asks one concise clarification or preserves the possible change until confirmation.

### V8A — High-impact transcript direction

Run these as separate completed voice turns:

- “The budget is now ₹40,000, replacing ₹1 lakh.”
- “The budget is not ₹40,000.”
- “The deadline is next week, not next month.”

Expected:

- Each material statement produces a distinct reflected interpretation.
- Replacement direction is never reversed.
- “Now” and “not” cannot trigger the same council request without user confirmation.
- Saying “no” preserves current work and asks for a precise restatement.
- A late pre-confirmation council result cannot clear the confirmation banner or trigger commentary for the unconfirmed change.

### V9 — Push-to-talk pointer drift

1. Hold the voice control and continue speaking.
2. While still holding, move the pointer slightly outside the visible button, then back inside.
3. Release only after finishing the sentence.

Expected:

- Moving outside does not complete the user turn or resume Sutradhara.
- One completed user turn appears only after deliberate release.
- `live.push_to_talk.stopped` records `reason=pointer_up` exactly once.
- A browser or operating-system cancellation records `pointer_cancel` or `lost_pointer_capture` and never produces duplicate stop handling.

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

### F5 — Refresh after completion

1. Complete a council round.
2. Refresh the page.

Expected:

- The newest authoritative Scroll, round mode, and revision counters are restored.
- Agent cards show done and product mode shows completed.
- The raw transcript and original intake prompt are not restored.
- Reconnect voice and verify Sutradhara can answer from the restored Scroll without asking for the original decision again.
- Say “Actually I need to decide within five days, not a few weeks.” Verify it is treated as material, a newer revision starts, and a second short utterance cannot overtake its materiality assessment.
- Restart the local server between the original decision and that correction. Verify the request includes `previousScroll`, the log records `council.context.hydrated`, all three specialists rerun, and the result mode is `full` rather than `initial`.
- Starting voice creates a new Live media session.
- **Start a new decision** removes the stored result and returns the UI to an empty conversation state.

### F6 — OpenAI Agents API stream uncertainty

With a mocked event stream, emit a provider session ID and then fail the connection.

Expected:

- The runtime retrieves provider session status before surfacing the error.
- The failure log includes the bounded status and does not blindly duplicate the turn.
- Cancellation events include stable idempotency keys.
- Successful runs produce per-stage `agent.run` records and one aggregate `council.telemetry` record.

### F6A — Foundry background-response uncertainty

With the Foundry runtime mocked, leave a response `in_progress`, then exercise
the bounded poll, terminal failure, and cancellation paths.

Expected:

- the runtime never treats `in_progress` as a completed result;
- polling ends at the configured bound;
- terminal errors remain provider-neutral at the shared UI boundary;
- schema repair and bounded-output recovery cannot bypass local Zod validation.

### F7 — Server-restart continuity

1. Complete an initial real-account voice decision and retain its authoritative Scroll.
2. Stop and restart the Express process so its in-memory council record and provider-session references are gone.
3. Refresh the browser, reconnect voice, and confirm Sutradhara can explain the restored result.
4. Speak one material correction that depends on the original decision context.

Expected:

- The new request includes `previousScroll`.
- `logs/deliberations.jsonl` records `council.context.hydrated`.
- Impact Router runs and all three specialists enter independent and cross-examination phases.
- The result mode is `full`, not `initial` or `selective`.
- The new Scroll preserves the original decision subject while incorporating the changed constraint.
- The prior Scroll remains visible until the new revision becomes authoritative.

### F8 — Fresh provider-generated Council Map trace

Use a decision created after the Council Map release; do not rely on an older stored Scroll.

Expected:

- Map view shows three selectable specialist nodes and six bounded critique edges.
- Each specialist exposes distinct `Opened with`, `Challenged`, and `Survived` text.
- Detailed Trail shows the same bounded trace without observations, uncertainties, provider payloads, or chain-of-thought.
- After one material reconvening, both revision selectors show their own trace and final synthesis.
- Refresh preserves the newest trace and revision navigation.
- Older records without a trace continue to say `detail not retained` instead of fabricating history.

## 7. Evidence checklist

Capture the following without secrets or private decision content:

- Automated command results.
- Screenshot of deliberating state with three truthful card states.
- Screenshot of completed compact result and expanded Scroll.
- Screenshot of reconvening with the prior Scroll preserved.
- Bounded excerpts from both JSONL logs showing revisions and lifecycle event names.
- Manual note of spoken briefing duration and whether each follow-up caused a rerun.
- Output of `npm run check:public-candidate`; never paste Live, provider-session, response, or delegation identifiers into tracked reports.

## 8. Public migration and hosted-origin gate

**Current status:** completed for the consolidated release on 20 October 2026.
The public migration and dependency-security changes are merged, both providers
passed the local owner-device sequence, and the exact public `main` passed the
owner-authenticated Azure Foundry hosted gate. Keep this section as the reusable
release gate for future provider, model, transport, authentication, or origin
changes.

For a future release candidate, after the automated checks pass:

1. Run one abbreviated initial decision plus one material reconvening with OpenAI.
2. Repeat with Foundry.
3. Through the intended HTTPS deployment, confirm the configured origin can
   negotiate voice and an unapproved origin receives 403.
4. Confirm credentials appear only in server settings and never in the built
   client, tracked files, screenshots, or validation report.
5. Keep the former private port unchanged as a historical rollback reference;
   public `main` remains authoritative.

The post-migration microphone run may reuse one short decision scenario; it does
not need to repeat every historical acceptance case.

The release passes only when automated checks pass, text-first behavior remains
intact, both affected provider adapters pass the abbreviated real-browser
sequence, the hosted-origin boundary passes, and no stale round can render or
speak. Historical full-flow evidence remains useful, but it does not replace a
short check against the exact candidate whenever one of those boundaries has
changed.
