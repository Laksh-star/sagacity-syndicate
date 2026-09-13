# Sagacity Syndicate: Live Voice Test Trail

Date: 13 September 2026  
Scope: GPT-Live voice intake, client delegation, completed-decision exploration, browser refresh, material-change detection, council reconvening, and spoken briefing.

This document collates the observable test trail from `logs/live-events.jsonl`, `logs/deliberations.jsonl`, and the browser transcript shown during the supervised test. It contains verified council artifacts and bounded diagnostic facts. It does not contain audio, API keys, transcript deltas, hidden reasoning, or private chain-of-thought.

Related comparison: [Voice vs Typed Session Results](2026-09-13-voice-vs-typed-session-results.md).

## Executive summary

| Test | Outcome | What it established |
| --- | --- | --- |
| Initial voice decision | Passed | A spoken decision produced one complete independent/cross-examination/synthesis round and a verified Scroll. |
| Post-decision voice exploration | Passed | Sutradhara answered from the verified result without starting another council round. |
| Browser refresh persistence | Passed | The latest Decision Scroll remained visible after refresh. |
| First post-refresh material change | Failed | The deadline change was classified non-material; no council round started and Sutradhara repeated the prior result. |
| Materiality and session-context fix | Automated verification passed | Restored context is seeded into a new Live session; explicit timing changes are deterministic; completed turns are serialized. |
| Second post-refresh material change | Lifecycle passed, content failed | The council reconvened and completed, but a server restart caused the underlying news-product context to be lost. |
| Restart-safe continuity fix | Automated verification passed; live retest pending | `previousScroll` now hydrates missing server context and forces one full council rebuild after restart. |

## Test 1 — Initial voice decision

### User decision

The user asked whether a broad news portal remains worthwhile as AI agents increasingly mediate news discovery and delivery. The decision included uncertainty about cost, effort, differentiation, and whether a portal remains the right interface.

### Lifecycle evidence

- Live session began at `2026-09-13T12:55:35.854Z`.
- Completed decision turn: `voice_turn_12`.
- Native delegation ID: `item_ENe3pqLwCU1ULnQCY7hTl`.
- Council ID: `b73e19d5-1884-4ef5-a129-7294bc4ee6a7`.
- Revisions: conversation `7`, deliberation `1`.
- Council started at `12:57:25.869Z`.
- Cross-examination began at `12:57:41.119Z`.
- Synthesis began at `12:57:56.074Z`.
- Verified completion occurred at `12:58:10.068Z`.
- Round mode: `initial`.
- Duration: approximately 44 seconds.

### Authoritative Decision Scroll

#### Decision

Do not pursue a broad horizontal news portal yet. Run a four-week manual pilot for one defined audience and workflow, delivering cited routine and breaking-news updates through both a lightweight portal and agent-compatible channels.

#### Rationale

The specialists agree that generic aggregation is vulnerable as agents become discovery and delivery layers. They differ on how much direct portals will persist, especially for breaking news. Therefore, test both routine and breaking use cases while treating trust and workflow—not interface—as the hypothesis.

#### Forethought

Separate reporting, verification, packaging, distribution, and monetization. Model recurring editorial and licensing costs, and keep delivery portable across portals, feeds, APIs, and agents.

#### Quickaction

Choose one audience, topic, and source set. Measure weekly repeat use, citation trust, manual cost, and willingness to pay. Stop if fewer than 30% return weekly or no users express payment intent.

#### Examiner

A destination portal is not itself a durable advantage. The opportunity depends on owning trusted selection, verification, original reporting, or an actionable workflow.

#### Trigger to reconvene

Reconvene after four weeks or 100 qualified users, when retention, trust feedback, editorial cost, licensing requirements, and payment intent are measured. Reassess sooner if a major distribution or agent shift changes acquisition materially.

Confidence: **88%**.

### Assessment

The result was decision-specific, appropriately cautious, and actionable. It separated the durable value hypothesis from the portal interface and supplied measurable stop conditions.

## Test 2 — Follow-up without reconvening

The user asked Sutradhara about the completed result. The application classified the follow-up as non-material, appended the verified Scroll as quiet Live context, and requested a conversational answer. No new `council.started` event appeared.

Outcome: **passed**. The product behaved as a moderator backed by an existing council result rather than rerunning analysis for a normal question.

## Test 3 — Refresh persistence

After a browser refresh, the existing 88%-confidence Scroll remained visible. The UI restored the prior council ID and revision counters from local browser storage.

Outcome: **passed**. The authoritative artifact survived refresh while raw transcript history did not.

## Test 4 — First material-change attempt after refresh

### Browser transcript

**User:** “Actually I need to decide within five days, in order to not a few weeks.”  
**Sutradhara:** “What's the decision you're facing?”  
**User:** “The previous context.”  
**Sutradhara:** “I don't have that in this chat. Could you give me the one-sentence version of the decision you're trying to make?”

Sutradhara then restated the prior news-portal briefing without reconvening.

### Diagnostic evidence

- New Live session: `2026-09-13T13:02:52.994Z`.
- First completed user turn: 66 characters at `13:03:13.181Z`.
- Second completed user turn: 21 characters at `13:03:23.660Z`.
- Both materiality assessments returned `false` with confidence `0.99`.
- The shorter second turn completed assessment before the earlier deadline statement.
- No `council.started` event followed.
- Revisions remained at conversation `9`, deliberation `1`.

### Root causes

1. A refreshed Live session was not immediately seeded with the restored verified Scroll.
2. The model-based materiality assessor incorrectly rejected an explicit deadline change.
3. Completed user turns were processed concurrently, allowing responses to complete out of conversational order.

### Corrective commit

Commit [`9582a5a`](https://github.com/Laksh-star/sagacity-syndicate/commit/9582a5a) added:

- quiet restored context on new Live connections;
- deterministic material recognition for explicit timing, budget, relocation, accepted-offer, and removed-option changes;
- serial completed-turn processing;
- prompt guidance preventing Sutradhara from claiming the restored context is missing;
- regression tests for the observed utterance and race.

Automated result after the fix: 14 test files, 56 tests, typecheck, and production build passed.

## Test 5 — Second material-change attempt

### Browser transcript

**User:** “Actually, I need to decide within five days, uh, not five weeks.”  
**Sutradhara:** “Okay, got it. Thanks, that's clear. I've put it to the council, and they've started. I'll bring you their synthesis as soon as it's ready.”  
**Sutradhara progress:** “The councilists have shared initial views and they're now testing assumptions.”

### Lifecycle evidence

- New Live session started at `2026-09-13T13:15:48.323Z`.
- Restored quiet context and `COMPLETED` status were both acknowledged before the new user turn.
- The 64-character deadline correction was classified material at `0.99` confidence.
- Revisions advanced to conversation `8`, deliberation `2`.
- Council started in reconvening product mode at `13:15:57.782Z`.
- Independent analysis, cross-examination, and synthesis completed.
- Verified completion occurred at `13:16:43.809Z`.
- Thinking, instructions, and commentary appends were all acknowledged.
- Round duration: 46,026 ms.
- Seven Agents API calls completed without a structured-output repair.

Outcome for lifecycle: **passed**.

### Spoken executive briefing

> Here's the punchline: Within 24 hours, confirm whether the 5-day deadline is truly fixed, classify the stakes and required approvals, and define must-have criteria. They all agree the shortened window forces prioritization and a clear information cut-off, but they differ on whether a pilot makes sense or if the deadline should be treated as absolute. Next, map out must-have criteria and deadline reality today; days two and three focus on critical facts and any required approvals. Reconvene if the deadline turns out flexible, a required approval can't happen, or a must-have fact remains missing.

The briefing was concise enough for the intended voice experience and did not read every Scroll field. The phrase “The councilists…” in the progress message was awkward, but it did not affect state.

### Authoritative revised Decision Scroll

#### Decision

Within 24 hours, confirm whether the five-day deadline is fixed, classify stakes and required approvals, and define must-have criteria. Then run a day-by-day evidence sprint, including one bounded test only if representative and low-risk; decide by day five using a reversible, contingency-backed option.

#### Rationale

All specialists agree that the shortened window requires prioritization, a firm information cutoff, and attention to reversibility. They differ on whether a pilot is worthwhile and whether the deadline should be treated as fixed. Resolve this first: negotiate briefly if feasible, assess stakes and approvals, then use only evidence that can change the choice within five days. If critical facts remain unavailable, choose the safest reversible option or escalate rather than pretending certainty.

#### Forethought

Favor a defensible, low-regret choice over exhaustive certainty. Include stakeholder and rollback checks, because a short deadline can conceal downstream failures or make an interim decision preferable.

#### Quickaction

Use a five-day sequence: criteria and deadline check on day one; critical facts and approvals on days two and three; bounded testing or comparison on day four; decision and contingency plan on day five. Stop researching when thresholds are met.

#### Examiner

The five-day limit materially changes the process, but the decision itself is unspecified. Prioritize deadline flexibility, stakes, irreversibility, approvals, and dependencies before choosing the evidence threshold.

#### Trigger to reconvene

Reconvene immediately if the deadline proves negotiable, required legal or specialist approval is unavailable, a critical must-have fact cannot be verified by day four, the bounded test produces adverse evidence, or no option has an acceptable rollback path.

Confidence: **93%**.

### Content assessment

Outcome for decision quality: **failed**.

The new Scroll was internally coherent but no longer addressed the news-product decision. The Examiner explicitly reported that the underlying decision was unspecified, making 93% confidence unjustified. The result was also labelled `initial` rather than `full` or `selective`.

### Root cause

The browser had restored the authoritative Scroll, but the local server had been restarted to deploy the previous fix. The council's in-memory provider sessions and specialist opinions were therefore absent. Although the request contained `previousScroll`, the orchestrator only entered Impact Router reconvening when it also found an existing in-memory record. The client also treated the latest transcript as sufficient context instead of combining it with the prior Scroll.

## Restart-safe continuity correction

The implementation now:

1. combines the prior verified Scroll with the latest conversation and changed constraint for every reconvening request;
2. hydrates `record.scroll` from `previousScroll` when the server has no in-memory record;
3. still runs the Impact Router;
4. forces one full three-specialist rebuild after restart because a Scroll cannot recreate provider session IDs or bounded prior opinions;
5. reports the result as `full`, never `initial`;
6. records `council.context.hydrated` in the local deliberation log.

Automated coverage creates an initial result with one orchestrator, constructs a fresh orchestrator to simulate a server restart, then reconvenes using the persisted Scroll and changed deadline. It verifies routing, all three independent reruns, and `mode: full`.

Status: **automated verification passed; real microphone retest pending**.

## Acceptance status after this test trail

| Requirement | Status |
| --- | --- |
| Transcript fragments do not cancel council work | Passed in automated coverage and observed voice run |
| Completed turns are distinct and ordered | Passed in automated coverage |
| Non-material follow-up does not rerun council | Passed in live test |
| Explicit deadline change triggers reconvening | Passed in live test |
| Prior Scroll remains visible during reconvening | Passed in live UI |
| Full Scroll and concise Voice Brief remain separate | Passed in live test |
| Live append acknowledgements are logged | Passed in live test |
| Refresh restores the authoritative Scroll | Passed in live test |
| Refresh restores quiet context to Sutradhara | Passed in live test |
| Server restart preserves decision substance during reconvening | Automated test passed; live retest pending |
| Stale results cannot render or speak | Passed in automated coverage; no stale collision observed in this run |

## Evidence sources and limitations

- `logs/live-events.jsonl` supplied session, turn, delegation, revision, phase, append, and acknowledgement events.
- `logs/deliberations.jsonl` supplied authoritative Scrolls, round modes, bounded council results, and aggregate timing.
- The supervised browser supplied the visible user/Sutradhara transcript quoted above.
- Local logs are ignored by Git and were not committed. This curated report is committed intentionally for product validation.
- Token usage was unavailable in the provider events for this run and is recorded as zero/unavailable rather than inferred.
- Append acknowledgement proves that GPT-Live accepted the application context; audible output was confirmed by the supervising user, not inferred from the acknowledgement event.
