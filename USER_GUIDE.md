# Sagacity Syndicate User Guide

Sagacity Syndicate helps you examine a decision through three specialist perspectives while Sutradhara acts as the conversational moderator.

It is a decision aid, not an authority. Verify high-stakes legal, medical, financial, employment, or safety claims independently.

## 1. What happens when you use it

```text
You describe a decision
  → Sutradhara clarifies only what is necessary
  → the council analyzes independently
  → the specialists challenge one another
  → a synthesis becomes the Decision Scroll
  → Sutradhara gives a short verbal briefing
  → you can explore the result conversationally
```

The roles are:

- **Forethought** examines future risks, prevention, scenarios, and second-order effects.
- **Quickaction** proposes immediate, practical, adaptable, low-regret moves.
- **Examiner** challenges assumptions, contradictions, and missing options.
- **Sutradhara** clarifies, delegates, reports status, and explains verified results. Sutradhara is not a fourth decision-maker.

## 2. Start the application

You need Node.js 22.6 or later.

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The default mock mode demonstrates the council flow without an OpenAI API key. To use GPT-Live and the Agents API, put your key and model settings in `.env` as described in the [README](README.md). Restart the development server after editing `.env`.

Keep `.env` local. Never commit, paste into chat, or place an API key in a screenshot.

## 3. Choose one input mode

The two tabs at the top of the left panel select the input path.

| Mode | Use it when | What you must do |
| --- | --- | --- |
| **Speak with Sutradhara** | You want a natural conversation | Start voice, hold to speak, and release. No written Decision Context or Convene click is required. |
| **Type decision** | You prefer a precise written prompt | Fill in Decision Context and select **Convene the council**. Voice is not required. |

The paths converge on the same council. Voice is not a different or less rigorous decision engine; it is a conversational intake and explanation layer around the text-first orchestration.

## 4. Voice workflow

### Start the session

1. Select **Speak with Sutradhara**.
2. Select **Start voice** and allow microphone access for the local site.
3. Wait until the control says **Hold to speak** and **Sutradhara is ready**.
4. Hold the control while speaking. Release when your utterance is complete.

Speak naturally, but include the facts that change the decision:

> I am considering moving to Bangalore for an AI-company role. I want stronger product experience, can spend up to ₹8 lakh, cannot move before January, and want to decide within six weeks.

You do not need special commands such as “convene the council.” Sutradhara may ask one concise question if a decision, hard constraint, or useful outcome is genuinely missing.

### Understand the handoff

After a complete decision is captured, the app may briefly show **Preparing the council**. It is giving native GPT-Live delegation a short preference window. If that signal does not arrive, an application fallback starts the same council path automatically.

**Send to council now** is an optional immediate override while preparation is pending. It is not a routine step.

The authoritative sign that work started is the UI changing to **The council is deliberating**. Sutradhara saying “I’ll put that to the council” is conversational acknowledgement, not proof that the backend started.

### While it works

The cards show actual orchestration state:

- **waiting** — this stage has not started for the specialist;
- **thinking** — the specialist is producing an independent view;
- **challenging** — the specialist is critiquing the other views;
- **done** — the specialist completed the current required stage;
- **error** — that specialist or stage failed.

The council may take tens of seconds because it performs parallel independent analysis, one cross-examination round, and synthesis. Sutradhara gives at most one useful progress update rather than narrating every phase.

You can say “Okay,” “What are they doing?” or “How long will this take?” without cancelling the council.

If Sutradhara is speaking when you press and hold, the browser pauses model audio immediately. The label beneath the control distinguishes **Sutradhara is speaking**, **Your turn · Sutradhara audio paused**, and **Waiting for Sutradhara**. The control captures your active pointer, so sliding slightly beyond the button does not end recording. Release deliberately to finish; browser cancellation or lost capture also stops safely. Speech interruption does not cancel the council unless the completed statement contains a material change.

### Receive the result

On success:

1. the complete Decision Scroll appears in the UI;
2. the headline and confidence become prominent;
3. the three compact specialist summaries show their main perspectives;
4. Sutradhara gives a short executive briefing, normally around 20–40 seconds;
5. **View full Decision Scroll** expands the complete artifact.

Sutradhara should not read all seven Scroll fields aloud.

## 5. Text workflow

1. Select **Type decision**.
2. Enter the decision, desired outcome, hard constraints, options, and time horizon.
3. Select **Convene the council**.
4. Watch the headline and agent cards move through the real phases.
5. Read the compact result, then expand **View full Decision Scroll** if desired.

A useful prompt is specific without becoming an essay:

> Should I relocate for a new role? My objective is stronger AI product experience. I can spend up to ₹8 lakh, cannot move before January, and want to decide within six weeks.

After a completed text result, enter one changed fact in **What materially changed?** and select **Reconvene**.

The latest completed Decision Scroll survives a page refresh. If you reconnect voice, Sutradhara receives the restored verified result quietly, so you can continue with “Why?” or state a changed constraint without restating the original decision. Select **Start a new decision** to delete that saved result, reset revisions and transcript state, and close the prior voice session.

### Save, export, and compare decisions

After a result completes, the **Decision workspace** appears below the Scroll:

- **Export current as Markdown** downloads the complete verified Scroll with its round type, revisions, timestamp, and confidence.
- **Initial versus revised decision** compares every Scroll field after reconvening and labels exact changes.
- **Local decision history** retains the ten newest verified revisions across decisions. Each entry can be exported independently.
- **Clear older history** keeps the current Scroll and removes older retained entries.

History is stored only in this browser. It contains bounded Decision Scroll artifacts and revision metadata—not the raw transcript, microphone audio, API keys, or private model reasoning. Clearing browser site data removes it.

## 6. Write a decision the council can use

Include these when they matter:

- the actual choice or action under consideration;
- what success means to you;
- hard constraints such as budget, location, deadline, health, or commitments;
- realistic options already available;
- the time horizon;
- what is known versus uncertain.

Avoid asking only “What should I do?” without context. Also avoid burying the decision in a long life history; begin with the choice, then add the facts that could change the recommendation.

## 7. Read the Decision Scroll

| Section | Meaning |
| --- | --- |
| **Decision** | The synthesized recommendation. |
| **Rationale** | The principal reasons and the important disagreement or tradeoff. |
| **Forethought** | The largest future risk and preventive consideration. |
| **Quickaction** | The best immediate, low-regret move. |
| **Examiner** | The most important hidden assumption, contradiction, or missing option. |
| **Trigger to reconvene** | New evidence or a future condition that should reopen the decision. |
| **Confidence** | Confidence in this bounded recommendation—not certainty or a probability that life will go as predicted. |

The full Decision Scroll is authoritative. The spoken Voice Brief is derived from it and intentionally shorter. If the spoken summary and screen ever appear inconsistent, rely on the newest completed Scroll and report the discrepancy as a bug.

### Use the Council Map

The completed Scroll now includes two complementary council views:

- **Map** is the default. The turtle, hare, and owl represent Forethought, Quickaction, and Examiner. Arrows show the all-to-all challenge round and the ideas flowing into synthesis. Select a specialist to reveal only its opening recommendation, critique, and surviving contribution.
- **Detailed trail** shows all three bounded contributions and the directed critique edges together for audit-oriented reading.

If a decision has been reconvened, select **Revision 1**, **Revision 2**, and later revisions to inspect how the council changed. During active deliberation, the same map projects actual agent states and phase. During reconvening, the previous verified decision remains authoritative until the replacement synthesis completes.

Older decisions saved before the Council Map was introduced still appear, but their detailed critique edges are marked as unavailable because the application did not retain them retroactively.

## 8. Explore the completed decision by voice

Keep the voice session open and ask focused questions:

- “Why?”
- “What made Forethought cautious?”
- “What did Quickaction recommend?”
- “Why did Quickaction disagree?”
- “What assumption did Examiner challenge?”
- “Why is confidence only 72%?”
- “When should I revisit this?”

These questions use the stored, verified Scroll and normally do not run the council again. Sutradhara answers selectively from bounded council facts.

If you ask for the “full analysis,” Sutradhara should direct you to the visible Decision Scroll and summarize the requested sections rather than reading the whole artifact aloud.

## 9. Change a constraint and reconvene

A material change is a fact that could alter the recommendation, reasoning, risk, or next move:

- “My budget is actually ₹8 lakh, not ₹20 lakh.”
- “I can no longer relocate.”
- “The deadline is next week, not next month.”
- “I already accepted another offer.”
- “Remove option B entirely.”

When you state a material change:

1. the UI changes to **Reconvening council**;
2. it shows what changed;
3. the application marks the old in-flight round stale and requests cancellation if necessary;
4. the Impact Router chooses a selective or full rerun;
5. the previous verified Scroll remains visible;
6. only a complete, current synthesis replaces it;
7. Sutradhara gives a new concise briefing.

If a statement is ambiguous—“That may not work”—the app preserves current work and asks one brief clarification rather than cancelling automatically.

## 10. What the visible states mean

| Visible state | Meaning | What you should do |
| --- | --- | --- |
| **Talking / Hold to speak** | Voice session is active; the council has not necessarily started | Describe the decision or answer Sutradhara |
| **Clarifying** | More decision context is needed | Answer the one focused question |
| **Preparing the council** | Readiness succeeded; native delegation/fallback coordination is in progress | Wait briefly; optional **Send to council now** can bypass the grace period |
| **The council is deliberating** | Backend council work is active | Watch phases; ordinary interjections are safe |
| **Synthesizing** | Independent and critique stages are complete | Wait for the verified Scroll |
| **Completed** | A current, schema-validated Scroll is authoritative | Read it or ask follow-up questions |
| **Reconvening council** | A material fact changed and a newer round is active | Keep using the old Scroll only as prior context until replacement completes |
| **Failed / Error** | The current attempt did not complete | Read the error, inspect logs, and retry after fixing the cause |

## 11. Transcript behavior

The transcript shows turns, not raw recognition fragments:

- **You** identifies completed or current user speech.
- **Sutradhara** identifies moderator speech.
- partial words update the current row instead of adding many rows;
- history is bounded so it does not overpower the decision UI;
- while you are at the bottom, it follows the latest turn;
- if you scroll upward, it preserves your position and shows **Jump to latest**.

Recognition can still make mistakes. Restate an important number or constraint clearly if the transcript is wrong. In voice mode, the optional written-details control can supply an exact figure, name, or spelling that is easier to type.

After a Scroll exists—or while the council is working—the **Precise typed correction** field is available even when voice remains connected. Use it for a factual change such as “The budget is ₹8 lakh, not ₹20 lakh.” Selecting **Reconvene** records one completed typed user turn and follows the same cancellation, revision, Impact Router, and stale-result safeguards as a spoken material change. Keep ordinary questions such as “Why?” in the voice conversation; they should not reconvene.

## 12. Common situations

### Sutradhara says it delegated, but the cards do not move

Wait for **Preparing the council** to resolve. If no native handoff arrives, the automatic fallback should start the council. Use **Send to council now** only if you want to skip the remaining grace period.

If the UI never changes to deliberating, check `logs/live-events.jsonl` for readiness, delegation, and start events. Do not keep repeating “convene the council,” because repeated voice turns may add noise without fixing the underlying connection or provider error.

### Voice remains on Connecting

- Confirm microphone permission for `localhost` or `127.0.0.1`.
- Try a current Chrome or Edge browser if an embedded browser does not expose microphone permission.
- Confirm `OPENAI_API_KEY` and `OPENAI_LIVE_MODEL` in `.env`.
- Restart `npm run dev` after changing environment variables.
- Open `/api/health`; `liveEnabled` should be `true`.

The client reports a microphone-permission timeout instead of waiting indefinitely.

### Agent cards show Error

- Read the visible error message.
- Confirm `MOCK_COUNCIL=false` only when your OpenAI project has access and credits.
- Verify `OPENAI_COUNCIL_MODEL` and `OPENAI_SYNTHESIS_MODEL`.
- Inspect `logs/deliberations.jsonl` for the failing phase.
- Try the text path to distinguish council/API trouble from GPT-Live trouble.

### The council is taking longer than expected

Check whether the phase is still advancing. A round includes multiple provider sessions, so duration varies with model availability and network conditions. If the phase and logs stop changing, inspect the latest error or restart only after preserving any output you need.

### The result looks outdated

State the changed fact through voice or use **What materially changed?** in text mode. A newer revision must complete before it replaces the current Scroll. An old provider response cannot become authoritative.

### Sutradhara does not speak after the Scroll appears

The Scroll can succeed even if browser audio playback or a Live commentary event fails. Check:

- system output volume and the browser tab's audio state;
- whether the voice session is still connected;
- `live.commentary.sent` and its acknowledgement in `logs/live-events.jsonl`;
- browser console errors.

An acknowledgement means GPT-Live accepted the event; it does not prove audible playback.

## 13. Logs and debugging

The app keeps local, git-ignored JSONL logs:

- `logs/deliberations.jsonl` includes revisions, council phases, validated specialist outputs, router results, final Scrolls, and errors.
- `logs/live-events.jsonl` includes bounded voice turn, readiness, delegation, append, interruption, cancellation, and stale-result events.

Open the small **Diagnostics** drawer at the bottom of the dashboard for an immediate browser-session view of the current mode, phase, revisions, agent states, shortened council ID, and recent lifecycle event names. This view is intentionally metadata-only and resets with the page; use the local JSONL files for the durable debugging trail.

For a healthy initial voice round, look for:

```text
live.session.started
live.user_turn.completed
live.readiness.assessed
live.delegation.created OR live.delegation.fallback
live.delegation.bound_to_revision
council.started
council.phase
council.completed
live.thinking.sent
live.commentary.sent
```

For a material correction, look for `live.interruption.materiality`, `council.cancel.requested` when a round was active, a newer deliberation revision, and then a newer `council.completed`.

See the [Architecture Guide](ARCHITECTURE.md) for the complete event and revision model and the [Test Plan](TEST_PLAN.md) for reproducible scenarios.

## 14. Privacy and safe sharing

- API keys stay on the server and `.env` is ignored by Git.
- The application does not write microphone audio to local logs.
- Raw transcript deltas are not logged.
- Raw chain-of-thought is neither requested nor displayed.
- Local logs can contain bounded decision facts and the final Decision Scroll.
- Browser storage contains the latest authoritative Scroll, its council ID, round mode, and revisions. It does not contain the raw transcript or original decision prompt.
- **Start a new decision** removes that browser-stored record.
- Review, redact, or delete logs before sharing a repository archive or support bundle.

## 15. Current proof-of-concept limits

- One local user; no sign-in, database, or multi-device history.
- Mock mode proves UI and orchestration mechanics, not OpenAI account access.
- Speech recognition may mishear names, currencies, and numbers.
- Automated tests cannot prove microphone permission, WebRTC connectivity, actual client delegation, or audible speech.
- Model and protocol changes require a real-account browser smoke test.

For the implementation design and diagrams, read the [Architecture Guide](ARCHITECTURE.md).
