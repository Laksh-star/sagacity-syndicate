# Sagacity Syndicate: Focused Reliability Retest

Date: 16 September 2026  
Status: Prepared; supervised real-account execution pending.

## Purpose

Close the two remaining live-evidence gaps after the pointer-capture fix and Council Map release:

1. server-restart continuity through `previousScroll` hydration;
2. a fresh provider-generated Council Map trace, including refresh persistence.

This run also verifies that pointer drift no longer ends a spoken turn prematurely.

## Preconditions

- Use the production build with `MOCK_COUNCIL=false`.
- Keep the existing ignored `.env`; never copy its values into this report.
- Start with empty application state or select **Start a new decision**.
- Keep `logs/live-events.jsonl` and `logs/deliberations.jsonl` available locally.
- Record approximate local timestamps for each checkpoint.

## Scenario

Use one decision with a clear objective, budget, deadline, and capacity constraint. The exact private wording does not need to be copied into this report.

### A. Pointer-capture boundary

1. Start voice.
2. Hold to speak for at least ten seconds.
3. While still holding, move outside the visible control and return.
4. Finish the sentence, then release.

Pass evidence:

- no premature transcript completion;
- no Sutradhara playback while still holding;
- one completed user turn;
- one `live.push_to_talk.stopped` event with `reason=pointer_up`;
- human confirmation that Sutradhara did not cut off the turn.

### B. Initial decision and Council Map

1. Allow automatic delegation and complete revision 1.
2. Inspect Map and Detailed Trail.
3. Select all three specialists.

Pass evidence:

- independent, cross-examining, and synthesizing phases appear in order;
- three distinct contributions appear;
- six directed critique edges are retained;
- the surviving synthesis matches the authoritative Decision Scroll;
- no observations, uncertainties, raw payloads, or chain-of-thought appear.

### C. Hard server restart

1. Preserve the completed browser result.
2. Stop and restart the Express process.
3. Refresh the browser and reconnect voice.
4. Ask one non-material question about the restored result; verify no council rerun.
5. Speak one material correction that depends on the original decision.

Pass evidence:

- the request carries `previousScroll`;
- `council.context.hydrated` is logged;
- all three specialists rerun;
- result mode is `full`;
- the new result preserves the original decision subject and incorporates the correction;
- the previous Scroll remains visible until verified replacement.

### D. Revision and refresh persistence

1. Compare revision 1 and revision 2 in Map view.
2. Compare them in Detailed Trail.
3. Refresh again.

Pass evidence:

- both revision selectors remain available;
- each revision retains its own contributions, critique edges, and synthesis;
- the newest revision remains authoritative;
- Sutradhara can explain the restored newest Scroll without another council run.

## Evidence to capture

- screenshots of pointer hold, completed revision 1, reconvening with prior Scroll, and revision 2;
- approximate local timestamps;
- exact visible mode and agent states;
- bounded lifecycle-event excerpts from both JSONL logs;
- the two authoritative Decision Scrolls;
- human notes for audible cutoff behavior and briefing length;
- typecheck, test, build, and `git diff --check` results.

## Completion rule

Do not mark this retest passed from automated checks alone. It is complete only after the supervised microphone, audible playback, hard server restart, fresh provider trace, and post-refresh behaviors are observed and the results are appended to a dated trail document.
