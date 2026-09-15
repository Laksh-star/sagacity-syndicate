# Sagacity Syndicate: Live Acceptance Test Trail

Date: 15 September 2026  
Scope: GPT-Live voice intake, automatic council handoff, non-material interjections, post-decision exploration, browser playback interruption, typed and spoken material corrections, reconvening, refresh continuity, decision history, and automated regression checks.

This report collates the supervised browser run with bounded evidence from `logs/live-events.jsonl` and `logs/deliberations.jsonl`. It contains verified application events and authoritative Decision Scrolls. It does not contain audio, API keys, transcript deltas, hidden reasoning, or private chain-of-thought.

All log timestamps below are UTC. The local test time was UTC+05:30.

## Executive summary

| Test | Outcome | Evidence |
| --- | --- | --- |
| Initial voice decision and automatic handoff | Passed | One aggregated 198-character turn was assessed ready; one fallback handoff started revision 1 and completed normally. |
| Non-material speech during deliberation | Passed | Two utterances during revision 1 were classified non-material; no cancellation or duplicate council start occurred. |
| Independent analysis, cross-examination, and synthesis | Passed | All three rounds recorded the expected ordered phases and schema-valid results without repair. |
| Concise result handoff | Passed with human confirmation | Thinking, instructions, and commentary were sent and acknowledged. The user confirmed the audible experience looked good; logs alone cannot prove what was heard. |
| Post-decision questions without rerun | Passed | Eight utterances were classified non-material across the run; normal questions received stored-result context without starting a council. |
| Browser playback interruption | Passed | `live.playback.suppressed`, stale-audio discard, and post-turn resume were recorded in order; the supervising user accepted the audible result. |
| Typed material correction | Passed | The budget correction was deterministically material and caused a full revision 2 council round. |
| Spoken material correction | Passed | The five-hour weekly-capacity change was classified material at 0.99 confidence and caused a full revision 3 council round. |
| Previous result preservation and comparison | Passed | The completed UI showed three retained decisions and a populated initial-versus-latest comparison. |
| Refresh and restored-result exploration | Passed | A second Live session received and acknowledged restored instructions and quiet context; the Examiner question did not reconvene. |
| Markdown export | Available; download not independently observed | The completed UI exposed **Export current as Markdown**, but browser/log evidence does not establish that a file was downloaded in this run. |
| Live stale-council collision | Not exercised | No late superseded council result occurred. Automated stale-result coverage passed. |

Overall result: **accepted for the proof-of-concept**, with the content-calibration and live-evidence limitations noted below.

## Test scenario

The initial decision concerned a two-week paid AI-workshop pilot with:

- a ₹2 lakh budget;
- a one-month deadline;
- ten paying customers as the success target; and
- ten available hours per week.

The user later changed the budget to ₹80,000 using the typed correction path, then changed weekly capacity from ten hours to five through voice.

## Lifecycle trail

### 1. Live intake and exactly-once handoff

- Live session `live_u7_EOC5o8L6I9Wtsao0OSpid` started at `01:17:46.065`.
- The initial user turn started at `01:18:02.526` and completed at `01:18:21.619` as one 198-character turn.
- Readiness was assessed as `convene` with 0.99 confidence.
- Native delegation did not arrive within the grace period, so the deterministic fallback fired at `01:18:36.755`.
- The fallback bound conversation revision 1 to deliberation revision 1.
- Exactly one `council.started` event was recorded for the initial revision.

Assessment: **passed**. Transcript fragments did not become separate decision requests, and the fallback produced one effective council start.

### 2. Non-material utterances did not cancel deliberation

While revision 1 was active, completed utterances were received at `01:18:37.110` and `01:19:23.126`. Both were assessed as incomplete or non-material with 0.99 confidence.

The council continued through:

```text
independent -> cross_examining -> synthesizing -> completed
```

No `council.cancel.requested`, `council.stale_result.discarded`, or error event was recorded during the test window.

Assessment: **passed**. Conversational speech did not destroy valid council work.

### 3. Initial council result

- Deliberation ID: `5d9d46aa-f5cb-4703-be8e-757b5e599bf2`
- Revisions: conversation 1, deliberation 1
- Mode: `initial`
- Duration: 49,719 ms
- Provider calls: 7
- Structured-output repairs: 0
- Confidence: 92%

#### Decision

Run a one-week, pre-sold acquisition sprint before the two-week pilot. Test one offer, price, and channel within the 10-hour weekly limit. Proceed only if five customers pay at viable economics; release funds in tranches, capped initially at ₹50,000, and retain the remainder.

#### Rationale

The specialists agree that a staged paid test is safer than committing ₹2 lakh immediately. Their main disagreement concerns the gate: three seats may be too weak, while five seats alone may not prove economics. Resolve this by requiring five paid seats within seven days at a price and acquisition cost that support the ten-customer target, while preserving time for delivery and follow-up.

#### Specialist perspectives

- **Forethought:** Use a standardized cohort and staged spending; avoid customization that exceeds the ten-hour weekly capacity.
- **Quickaction:** Run seven days of outreach to a defined prospect list with upfront payment.
- **Examiner:** Treat ten customers as a sales goal rather than proof of viability; validate payment and channel access before committing the budget.

### 4. Decision exploration and playback interruption

The user asked normal questions about the completed result. Materiality assessments correctly returned false, verified Scroll context was appended through the thinking channel, and concise answer instructions were appended through commentary. No new council started.

At `01:20:55.488`, push-to-talk was activated while Sutradhara output was active:

```text
live.playback.started
live.playback.suppressed
live.user_turn.started
live.user_turn.completed
live.playback.stale_audio.discarded
live.playback.resumed
```

The completed interruption turn contained no transcript text, so it did not trigger materiality or council invalidation. Subsequent requests such as the immediate-next-step question were classified non-material and answered from the verified Scroll.

Assessment: **passed at application-state level and accepted by the supervising user at audible level**. The log demonstrates mute, stale-tail rejection, and recovery decisions; it cannot independently measure the sound heard by the user.

### 5. Typed budget correction and revision 2

At `01:21:44.363`, a 34-character typed correction changed the budget from ₹2 lakh to ₹80,000.

- Materiality: true, confidence 1.0
- Conversation revision: 9
- Deliberation revision: 2
- Impact Router: all three specialists affected, confidence 0.98
- Mode: `full`
- Duration: 63,676 ms
- Provider calls: 8
- Structured-output repairs: 0
- Confidence: 96%

#### Revised decision

Start a seven-day, pre-sold acquisition sprint today for one standardized AI workshop offer, price, and channel. Require upfront payment, spend initially no more than ₹10,000, and release further funds only if five customers pay at economics supporting ten total customers within the ₹80,000 budget and time limit.

Assessment: **passed**. The reduced budget materially tightened the initial spending tranche and caused a full, revision-safe reconvening.

### 6. Spoken capacity correction and revision 3

At `01:23:27.698`, a 54-character completed voice turn changed weekly capacity from ten hours to five.

- Native delegation ID: `item_EOCBLLkcqFcCDpfwnjoU8`
- Materiality: true, confidence 0.99
- Conversation revision: 10
- Deliberation revision: 3
- Impact Router: all three specialists affected, confidence 0.99
- Mode: `full`
- Duration: 61,582 ms
- Provider calls: 8
- Structured-output repairs: 0
- Confidence: 94%

The round completed all phases. Final instructions, thinking context, and commentary were acknowledged by GPT-Live.

#### Authoritative Decision Scroll

**Decision**

Run a 48-hour, no-ad-spend pre-sale test today for one standardized workshop. Define price, duration, total delivery hours, and break-even before outreach; contact 20 warm prospects, require upfront payment, and accept seat five only if ten-customer capacity fits five weekly hours.

**Rationale**

The specialists agree on a narrow, standardized, upfront-paid test, but correctly challenge the prior five-seat gate: it cannot prove ten-customer viability without delivery-hour evidence. Conflicting ₹5,000 and ₹10,000 caps are resolved by starting at ₹0; paid demand and capacity must unlock later spend.

**Forethought — biggest future risk**

Keep the offer standardized and the prospect list reachable. Preserve at least ₹70,000 and authorize spending only after paid demand and delivery capacity are evidenced.

**Quickaction — best immediate move**

Today, spend up to two hours defining the offer and capacity, then use the remaining time for personalized invitations to 20 prospects with a 48-hour payment deadline. Track replies, payments, hours, and capacity.

**Examiner — hidden assumption**

Delivery capacity is the binding constraint. Specify workshop duration, preparation, price, and break-even seats before selling; use warm prospects and unpaid outreach first.

**Trigger to reconvene**

Reconvene after 48 hours or when all 20 prospects respond. Review paid seats, conversion, price, delivery hours, break-even economics, and weekly capacity. Proceed only if five seats and ten-customer capacity are supported; otherwise revise, switch channel, or cancel.

Confidence: **94%**.

### 7. Refresh continuity and stored-result exploration

A second Live session, `live_u7_EOCEB4tUAezk8HeBOnrs2`, began at `01:26:25.066` after the completed result was restored. Revision 3 instructions and quiet council context were sent immediately and acknowledged.

The user then asked, “What assumption did Examiner challenge?” The completed UI showed Sutradhara answering that Examiner challenged five seats as sufficient proof and identified delivery capacity as the binding constraint. The utterance was classified non-material at 0.99 confidence, and no fourth council round started.

The inspected final UI showed:

- product mode `COMPLETED`;
- all three specialist cards `DONE`;
- round label `full round`;
- 94% confidence and the revision 3 Scroll;
- revisions `11 / 3`;
- three of ten local decisions retained;
- a populated initial-versus-revised comparison; and
- the current Markdown export affordance.

Assessment: **passed**. Restored context supported post-refresh exploration without repeating the council.

## Result-quality review

The final recommendation is coherent and materially responsive to both corrections. Each revision changes the operating plan rather than merely restating the first answer:

1. ₹2 lakh and ten weekly hours produced a seven-day paid-acquisition test with a ₹50,000 initial cap.
2. ₹80,000 tightened the initial tranche to ₹10,000 and emphasized acquisition economics.
3. Five weekly hours made delivery capacity the binding constraint, shortened the first validation step to 48 hours, and reduced initial ad spend to zero.

The strongest part is Examiner's correction of the success metric: five paid seats demonstrate some demand but do not establish that ten customers can be served within five weekly hours. The final Scroll therefore asks for delivery hours, price, break-even, and capacity before accepting seat five.

One content caveat remains: **94% confidence is optimistic** because the price, actual access to 20 warm prospects, conversion history, and workshop delivery workload remain unknown. The decision is still useful because it recommends a reversible test, but a confidence range closer to moderate-high would better reflect those uncertainties.

## Automated verification

Verified against commit `9b0eb3e` after the live run:

```text
npm run typecheck  PASS
npm test           PASS — 16 files, 67 tests
npm run build      PASS — production bundle created
git diff --check   PASS
```

## Evidence and limitations

- `logs/live-events.jsonl` supplied session, turn, readiness, delegation, revision, phase, materiality, append, acknowledgement, and playback-control events.
- `logs/deliberations.jsonl` supplied bounded specialist outputs, Impact Router results, authoritative Scrolls, round modes, and aggregate timing.
- The final browser state supplied the visible Scroll, specialist states, transcript answer, decision-history count, comparison, and revision display.
- The supervising user's acceptance is the evidence that audible behavior was satisfactory. Append acknowledgements and playback events do not themselves prove what a human heard.
- Exact Voice Brief duration was not measured.
- The Markdown export control was visible, but the download itself was not independently observed.
- No live stale-council collision occurred. The rule preventing superseded results from rendering or speaking remains covered by the automated suite.
- No errors, cancellation requests, or stale-result publications were found in the bounded test window.
- Local JSONL logs remain ignored by Git. This curated report is intended for repository history.

## Final acceptance

The run validates the intended product loop:

```text
voice decision
-> automatic delegation
-> visible council deliberation
-> authoritative Decision Scroll
-> concise spoken interpretation
-> conversational exploration without rerun
-> material typed correction and full reconvening
-> material spoken correction and full reconvening
-> restored-result exploration after refresh
```

Status: **accepted for the current proof-of-concept**. The next quality improvement should calibrate synthesis confidence against unresolved uncertainties; it is not a blocker for this acceptance.
