# Sagacity Syndicate User Guide

Sagacity Syndicate helps you examine a decision through three specialist perspectives while Sutradhara acts as the conversational moderator.

The council provides advice, not authority. Treat its result as a structured decision aid and verify high-stakes legal, medical, financial, or employment claims independently.

## Start the application

You need Node.js 22.6 or later.

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The default mock mode demonstrates the complete council flow without an OpenAI API key. For live Agents API and GPT-Live use, configure `.env` as described in the README. Keep that file local; never commit it.

## What the council does

- **Forethought** examines future risks, prevention, scenarios, and second-order effects.
- **Quickaction** proposes immediate, practical, adaptable, low-regret moves.
- **Examiner** challenges assumptions, contradictions, and missing options.
- **Sutradhara** clarifies, delegates, reports status, and explains the verified result. Sutradhara is not a fourth decision-maker.

Each council round follows this sequence:

```text
independent views → cross-examination → synthesis → Decision Scroll
```

## Text-first use

1. Enter the decision you are considering.
2. Include the outcome you want, hard constraints, relevant options, and time horizon.
3. Select **Convene the council**.
4. Watch the agent cards move through thinking, challenging, and done.
5. Read the decision headline, confidence, and compact perspective summaries.
6. Expand **View full Decision Scroll** for the complete result.

A useful decision prompt looks like this:

> Should I relocate for a new role? My objective is stronger AI product experience. I can spend up to ₹8 lakh, cannot move before January, and want to decide within six weeks.

## Voice use

1. Use a normal browser with microphone permission enabled for the local site.
2. Keep **Speak with Sutradhara** selected and choose **Start voice**.
3. Hold the voice control while speaking, then release when finished.
4. Answer only the clarification Sutradhara asks.
5. The app automatically hands a ready decision to the council. You do not need to type in Decision Context or select Convene in voice mode.
6. When the application actually starts the council, the UI changes to **The council is deliberating**. Sutradhara saying that it intends to delegate is not the status signal; the UI is authoritative.
7. Wait for the full Decision Scroll to appear. Sutradhara will give a short executive briefing rather than reading the Scroll aloud.

The written details control in voice mode is optional and is intended for exact figures or spellings that are easier to type. The transcript displays complete conversational turns, not every streaming fragment. It is taller and scrollable, follows new turns while you are at the bottom, and shows **Jump to latest** if you scroll upward.

If the app is briefly showing **Preparing the council**, it is giving native GPT-Live delegation a short preference window. If no native delegation arrives, the application starts the council itself. **Send to council now** is an optional immediate override, not a required step.

To use the original text workflow, select **Type decision**, enter the Decision Context, and select **Convene the council**. Voice is not required in that mode.

## While the council is deliberating

You can say things such as:

- “Okay.”
- “How long will this take?”
- “What are they doing?”

These conversational remarks do not cancel the council.

If you introduce a material change, such as a different budget or deadline, the app may reconvene:

> My budget is actually ₹8 lakh, not ₹20 lakh.

During reconvening, the previous verified Decision Scroll remains visible until the new synthesis becomes authoritative.

## Explore a completed decision

After completion, ask Sutradhara focused questions:

- “Why?”
- “What made Forethought cautious?”
- “Why did Quickaction disagree?”
- “What assumption did Examiner challenge?”
- “Why is confidence only 72%?”
- “When should I revisit this?”

These questions use the existing verified council result and normally do not rerun the council.

A new fact that could change the recommendation does trigger reconvening:

- “The budget has dropped by half.”
- “I can no longer relocate.”
- “The deadline is next week.”
- “Remove option B.”

If the meaning is ambiguous, Sutradhara should ask one brief clarification while preserving the current result or active work.

## Reading the Decision Scroll

- **Decision** is the synthesized recommendation.
- **Rationale** explains the main evidence and disagreement.
- **Forethought** identifies the largest future risk.
- **Quickaction** gives the best immediate move.
- **Examiner** identifies a hidden assumption or missing option.
- **Trigger to reconvene** states what future evidence should reopen the decision.
- **Confidence** expresses the council's confidence in the bounded recommendation, not a guarantee of correctness.

The full Decision Scroll is the authoritative artifact. The spoken Voice Brief is intentionally shorter and contains only the recommendation, main reason, key tension, immediate next step, and optional reconvening trigger.

## Troubleshooting

### Voice remains on Connecting

- Confirm microphone access for `localhost` or `127.0.0.1` in the browser.
- Retry in current Chrome or Edge if an embedded browser does not expose microphone permission.
- Confirm `OPENAI_API_KEY` and `OPENAI_LIVE_MODEL` are set in `.env`.
- Check `/api/health`; `liveEnabled` should be `true`.

The UI reports a microphone-permission timeout instead of waiting forever.

### The council fails or stops

- Check the visible error message first.
- Inspect `logs/deliberations.jsonl` for council phases and bounded results.
- Inspect `logs/live-events.jsonl` for voice turn, delegation, append, cancellation, or stale-result events.
- Restart `npm run dev` after changing environment variables.

For the handoff path, `logs/live-events.jsonl` should show `live.readiness.assessed`, then either `live.delegation.created` or `live.delegation.fallback`, followed by `council.started`. If the UI says the council is deliberating, that state came from a real application event rather than from Sutradhara's speech.

An append acknowledgement confirms GPT-Live accepted context; it does not prove that audio was audible.

### A result looks outdated

Add the changed fact through voice or the **What materially changed?** field and reconvene. The revision model prevents an older late result from replacing or speaking over a newer round.

## Privacy

- API keys stay on the server and `.env` is ignored by Git.
- Audio is handled by the active GPT-Live session and is not written to local logs by this application.
- Local JSONL logs may contain bounded decision facts. Review or delete them before sharing a project archive.
- Raw chain-of-thought is neither requested nor displayed.
