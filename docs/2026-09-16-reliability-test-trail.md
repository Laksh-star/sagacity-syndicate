# Sagacity Syndicate: Reliability and Voice-Correction Test Trail

Date: 16 September 2026  
Scope: provider-stream failure diagnosis, pointer-capture behavior, server-restart continuity, persisted decision history, Council Map integrity, spoken material corrections, full reconvening, GPT-Live result briefing, and automated regression checks.

This report collates a supervised real-account browser session with bounded evidence from `logs/live-events.jsonl`, `logs/deliberations.jsonl`, and the final rendered dashboard. It records both the unsuccessful attempts and the successful final retest. It does not contain API keys, transcript deltas, hidden reasoning, or private chain-of-thought.

All log timestamps below are UTC. The local test time was UTC+05:30.

## Executive summary

| Test | Outcome | Evidence |
| --- | --- | --- |
| Provider-stream failure diagnosis | Diagnosed; code path fixed, live recurrence not observed | An earlier Quickaction stream ended while the provider reported `in_progress`. The completed provider turn was recoverable on inspection. Later rounds completed without failure; the new recovery branch was not forced live. |
| Push-to-talk pointer drift | Passed | The user moved outside the control while holding it. The completed event recorded `reason=pointer_up`, not pointer exit, and the full utterance was retained. |
| Server-restart continuity | Passed | The server had no in-memory record and logged `council.context.hydrated` from `previousScroll`; a full three-specialist revision completed. |
| Decision history after refresh | Passed | The final dashboard retained seven local decisions, showed initial-versus-latest comparison, and exposed open/export controls. |
| Council Map peer-only critique graph | Passed | Revision 4 showed three distinct specialist contributions and six directed peer critiques, with no self-critique edge. |
| First spoken budget correction | Lifecycle passed; meaning ambiguous | One 85-character turn reconvened revision 3 and completed normally, but speech recognition rendered “now” as “not,” changing the meaning. |
| Corrected spoken budget confirmation | Passed | One 84-character turn confirmed ₹40,000 replacing ₹1,00,000; revision 4 completed with all three specialists aligned. |
| Concise GPT-Live result briefing | Passed with human observation | Final instructions, thinking context, and commentary were acknowledged; the visible transcript contained a concise briefing consistent with the Scroll. |
| Stale-result protection | No collision exercised | No superseded provider result arrived during these final two rounds. Automated stale-result coverage passed. |
| Automated verification | Passed | Typecheck, 19 test files/81 tests, production build, and `git diff --check` passed. |

Overall result: **accepted for the proof-of-concept, with one remaining material-transcript confirmation improvement recommended**.

## Scenario

The decision concerned a reversible paid workshop pilot. The authoritative initial result used:

- a total budget of ₹1,00,000;
- an eight-hour weekly capacity limit;
- a ten-day outreach sprint to 40 targeted businesses;
- six refundable deposits as the demand gate; and
- a ₹15,000 pre-validation spending cap.

The supervised restart and correction sequence attempted to replace the ₹1,00,000 total budget with ₹40,000 while preserving the decision's subject and previously verified constraints.

## Lifecycle trail

### 1. Earlier provider-stream failure

At `11:25:23.217`, the Quickaction opinion stream failed while the provider session still reported `in_progress`:

```text
Agent session stream failed; provider status is in_progress.
An internal error occurred.
```

The provider session was later inspected read-only and contained a completed turn and usable final output. The implementation was amended to poll a still-running session for a bounded interval, retrieve the latest completed turn and items, and validate the recovered final output. Irrecoverable failures now cancel sibling provider work.

Assessment: **the root cause and recovery path were addressed, but this live run did not force another broken stream**. All later calls completed normally, so the automated recovery tests remain the direct evidence for the new branch.

### 2. Pointer-capture boundary

The user deliberately moved the pointer around while holding the push-to-talk control. The observed stop events recorded:

```text
live.push_to_talk.stopped  reason=pointer_up
```

The control did not stop merely because the pointer left the visible button. A subsequent material turn was retained as one completed 85-character utterance.

Assessment: **passed**. The earlier pointer-drift cutoff issue is closed for this supervised scenario. The provider-stream error was unrelated to pointer movement.

### 3. Initial verified decision and Council Map

Revision 1 completed at `11:32:35.312`.

- Deliberation ID: `65d0dcf0-35cd-4f5f-83f0-805ea369b3ae`
- Mode: `initial`
- Duration: 43,730 ms
- Provider calls: 7
- Structured-output repairs: 0
- Recovered calls: 0
- Confidence: 88%

#### Initial decision

Proceed with a reversible paid pilot, not a full ₹1 lakh launch. Define one SME segment and outcome, run a 10-day outreach sprint, and seek 6 refundable deposits while spending no more than ₹15,000. Deliver a 4–6-seat pilot, then expand toward 12 only if delivery quality is strong.

The generated Council Map contained:

- one bounded contribution from each specialist;
- six directed critique edges between different specialists; and
- one surviving synthesis matching the authoritative Decision Scroll.

Assessment: **passed**. No self-critique edge or private reasoning appeared in the rendered map.

### 4. Server-restart continuity

After the server process restarted, the browser retained the verified decision while the server no longer held its in-memory record. At `11:38:27.244`, the next revision logged:

```text
council.context.hydrated
source=previousScroll
reason=The server had no in-memory record for this persisted browser decision.
```

The Impact Router and all three specialists then ran, producing a full revision 2 result at `11:39:24.711`.

- Mode: `full`
- Duration: 57,469 ms
- Provider calls: 8
- Structured-output repairs: 0
- Recovered calls: 0
- Confidence: 88%

The result retained the workshop-pilot subject, the ten-day outreach plan, six-deposit gate, eight-hour weekly limit, and ₹15,000 validation cap.

Assessment: **passed**. This closes the earlier evidence gap around reconstruction from `previousScroll` after loss of server memory.

### 5. First spoken correction: stable lifecycle, ambiguous meaning

A new GPT-Live session began at `11:41:42.974`. The user intended to say that the budget was **now** ₹40,000, replacing ₹1,00,000. The rendered completed transcript instead contained:

> The total budget is not 40,000 rupees. This replaces the earlier 1 lakh rupee budget.

Lifecycle evidence:

- one user turn started at `11:41:44.751`;
- push-to-talk stopped with `reason=pointer_up`;
- one 85-character completed turn was emitted;
- materiality was true at 0.99 confidence;
- one delegation bound to conversation revision 3 and deliberation revision 3;
- the council completed `independent -> cross_examining -> synthesizing -> completed`;
- all result instructions, thinking context, and commentary were acknowledged; and
- no cancellation or stale-result publication occurred.

Revision 3 completed in 62,461 ms using eight provider calls, with no repair or recovery. Its conclusion paused budget reallocation because the recognized word “not” rejected ₹40,000 instead of confirming it.

Assessment: **lifecycle passed; semantic result rejected for the user's intended meaning**. This was a speech-recognition ambiguity, not a delegation, revision, or council-state failure.

### 6. Corrected spoken confirmation and revision 4

The user repeated the constraint as an explicit confirmation. The visible completed turn was:

> Just to confirm, the new total budget is forty thousand replacing one lot, one lakh. Is it right?

Although speech recognition inserted the harmless phrase “one lot,” the replacement direction remained clear.

Lifecycle evidence:

- Live session: `live_u7_EOiMYp3oNQNuhYoGuJuZLJANHKaGSi7g`
- User turn: one 84-character completed turn
- Native delegation: `item_EOiMjCsnPIKsSLBkTc3D6`
- Materiality: true, confidence 0.99
- Conversation revision: 4
- Deliberation revision: 4
- Impact Router: all three specialists affected, confidence 0.99
- Mode: `full`
- Duration: 58,318 ms
- Provider calls: 8
- Structured-output repairs: 0
- Recovered calls: 0
- Confidence: 98%

The phase sequence was:

```text
routing
-> independent
-> cross_examining
-> synthesizing
-> completed
```

The three independent opinions all explicitly agreed that ₹40,000 replaced ₹1,00,000. Cross-examination then focused on the allocation of the remaining ₹25,000, the status of the ₹15,000 validation cap, refund exposure, workload limits, and tranche-release rules.

#### Authoritative Decision Scroll

**Decision**

Record ₹40,000 as the total budget replacing ₹1,00,000. Continue the reversible 10-day sprint under the ₹15,000 cap; do not release the remaining ₹25,000 until allocation, refund reserve, workload limits, and evidence gates are explicitly confirmed.

**Rationale**

All specialists agree ₹40,000 replaces ₹1,00,000 and supports staged validation. They do not establish a reserve split, timing, or whether the ₹15,000 cap and workload limit need renewed confirmation. Therefore, continue the reversible sprint while preserving protections and withholding later funding.

**Forethought — biggest future risk**

Preserve the ₹25,000 balance for refunds, delivery, contingency, and learning. Release tranches only after six refundable deposits, eight-hour delivery feasibility, and at least 4/5 satisfaction.

**Quickaction — best immediate move**

Contact 40 targeted businesses and seek six refundable deposits within 10 days. Keep the initial spend within ₹15,000 and document the remaining allocation before any further release.

**Examiner — hidden assumption**

The budget ambiguity is resolved, but the spending schedule is not. Treat ₹40,000 as a ceiling, not authorization for immediate full deployment.

**Trigger to reconvene**

Reconvene when the ₹40,000 allocation, ₹15,000 cap, workload limit, refund reserve, and tranche rules are explicitly confirmed, or on day 10/after 40 contacts. Advance only with six refundable deposits, feasible eight-hour delivery, and satisfaction of at least 4/5.

Confidence: **98%**.

Assessment: **passed**. The council incorporated the corrected direction consistently and produced a coherent revision rather than merely restating the previous result.

### 7. GPT-Live acknowledgement and briefing

After synthesis, the application sent three separate bounded payloads:

- authoritative status instructions: 249 characters;
- quiet verified council context: 913 characters; and
- spoken-commentary input: 803 characters.

All three were acknowledged. The visible Sutradhara briefing summarized the recommendation, the reason for treating ₹40,000 as a ceiling, the immediate outreach/deposit action, and the reconvening trigger. It did not read every Decision Scroll field aloud.

Assessment: **passed at control-plane and visible-transcript levels, with human observation covering the audible experience**. Append acknowledgements do not independently prove what was heard.

### 8. Persisted UI state

The inspected completed dashboard showed:

- product mode `COMPLETED`;
- revisions `4 / 4`;
- Revision 4 selected in the Council Map;
- three specialist nodes marked `DONE`;
- six bounded peer critique edges;
- the 98% authoritative Decision Scroll;
- initial-versus-latest comparison;
- seven of ten local decisions retained;
- open/export controls for saved decisions; and
- the affordance to ask Sutradhara about the verified result.

Assessment: **passed**. Refresh and restart did not erase browser-retained history, and the newest verified revision remained authoritative.

## Result-quality review

Revision 4 is materially better than revision 3 because it correctly resolves the replacement direction. It also preserves the useful parts of the original decision instead of treating the lower budget as a reason to discard the whole plan.

The strongest synthesis choice is the separation between:

- **total ceiling:** ₹40,000;
- **currently authorized validation tranche:** ₹15,000; and
- **withheld balance:** ₹25,000 pending allocation and evidence.

The main content caveat is the **98% confidence score**. The correction itself is highly certain, but demand, conversion, delivery effort, satisfaction, and reserve allocation remain unverified. A product-level confidence calibration rule should distinguish confidence in the interpreted constraint from confidence in the business outcome.

## Remaining improvement: confirm high-impact transcript ambiguity

This run proves that stable transcript aggregation and revision-safe handoff work. It also demonstrates that a complete transcript can still be semantically wrong when recognition changes a single high-impact word such as “now” to “not.”

Recommended behavior:

1. Detect explicit replacements, negations, and conflicts involving material values.
2. Reflect the interpretation back in normalized form, for example: “The new total is ₹40,000, replacing ₹1,00,000—is that correct?”
3. Wait for a brief confirmation when the transcript is internally contradictory or reverses a prior constraint.
4. Reconvene only after confirmation; do not discard the existing authoritative Scroll while waiting.

This is a semantic confirmation improvement, not a reason to reintroduce fragment-based interruption handling.

## Automated verification

Verified after the supervised run against commit `f1a556a`:

```text
npm run typecheck  PASS
npm test           PASS — 19 files, 81 tests
npm run build      PASS — production bundle created
git diff --check   PASS
```

## Evidence and limitations

- `logs/live-events.jsonl` supplied bounded session, completed-turn, pointer-stop, delegation, materiality, phase, append, acknowledgement, and playback events.
- `logs/deliberations.jsonl` supplied hydration, Impact Router, bounded specialist outputs, critiques, authoritative Scrolls, and aggregate telemetry.
- The final dashboard supplied the rendered transcript, Council Map, comparison, history count, and selected authoritative revision.
- The supervising user's observation is the evidence for what was actually spoken and heard. Logs establish intent and acknowledgement, not acoustic output.
- The provider recovery implementation did not encounter another broken stream after the fix; its direct live recovery remains unexercised.
- No late superseded council response occurred in this final window; stale-result suppression remains covered by automated tests.
- Confidence calibration remains a product-quality opportunity.
- Local JSONL logs remain ignored by Git. This curated report is the repository-safe evidence artifact.

## Final acceptance

The session validates this extended product loop:

```text
persisted browser decision
-> server memory absent
-> previousScroll hydration
-> full council reconvening
-> pointer-safe spoken correction
-> independent analysis and peer-only cross-examination
-> authoritative revised Decision Scroll
-> concise GPT-Live briefing
-> persisted history and revision map
```

Status: **accepted for the current proof-of-concept**. The restart-continuity, pointer-capture, decision-history, and Council Map evidence gaps are closed. The remaining recommended improvement is an explicit confirmation step for ambiguous, high-impact speech transcriptions.
