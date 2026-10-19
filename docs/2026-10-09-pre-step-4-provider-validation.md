# Pre-Step-4 provider validation trail

Date: 2026-10-09

Branch: `review/consolidation-safety-2026-10-09`

Scope: validation after the baseline, ADR, and five narrow consolidation fixes; before any voice transport split.

## Verdict

The shared application contracts and OpenAI council backend pass the current automated and live checks. The live check exposed one provider-schema defect in voice readiness; it was reproduced, fixed, regression-tested, and verified against the live OpenAI Agents endpoint.

The local dual-provider voice gate is **complete**. The original unattended validation environment had an ignored OpenAI key but no local Foundry credential set, Azure CLI session or human microphone/audio witness. Owner-device runs on 18 October 2026 subsequently exercised the prescribed local path with both providers. Consequently:

- OpenAI council and intake-model behavior: live verified.
- OpenAI GPT-Live WebRTC speech, playback, delegation, post-decision exploration and material reconvening: owner-device verified with a `96.2%` qualified acceptance score. One confirmation-wording UX issue remains.
- Foundry council and voice: owner-device verified with a `95.5%` qualified acceptance score. The only scored deduction is a minor `20-person` → `20%` transcript/read-back slip that did not change the lifecycle or recommendation.
- Step 4, the transport split: authorized by the local dual-provider evidence. A configured hosted-origin check remains a separate deployment gate and was not in scope for these local runs.

## Contract checked against current OpenAI documentation

The current client-delegation contract used for this pass is:

- the application owns confirmation and task state;
- transcript fragments are not complete user turns;
- a delegation event is metadata, not task text;
- the original delegation identifier must be preserved for task-specific updates;
- background facts use the thinking channel, while intended spoken results use commentary;
- backend completion and audible playback are separate acceptance outcomes.

Reference: [Delegation and tools in GPT-Live](https://developers.openai.com/api/docs/guides/live-delegation).

## Scenario

Initial decision:

> A 20-person professional-services company is deciding whether to run a 10-day internal AI-assistant pilot for research and coding. The pilot budget is INR 100,000. Client confidential data must not be used. The decision requested is whether to proceed, with a reversible first step and measurable success criteria.

Material revision:

> The maximum pilot budget is now INR 40,000 instead of INR 100,000.

This scenario tests bounded intake, initial deliberation, structured synthesis, materiality routing, revision progression, and a full reconvening.

## Automated evidence

The existing suite covers both provider paths without splitting the shared client class:

| Contract | Evidence |
| --- | --- |
| Provider values and model/deployment isolation | `tests/config.test.ts` |
| Local and hosted HTTPS origin allow-list behavior | `tests/origin-policy.test.ts` |
| OpenAI transcript fragments, causal turns, late delegation, and append correlation | `tests/voice-turns.test.ts`, `tests/voice-handoff.test.ts` |
| Foundry transcript completion, event deduplication, quiet context, serialized speech, and acknowledgements | `tests/foundry-voice.test.ts` |
| Provider-neutral read-back and explicit approval before council start | `tests/voice-intake-app.test.jsx` |
| Previous verified Scroll preservation and stale-result suppression | `tests/voice-lifecycle.test.ts` |
| Structured readiness output compatibility | `tests/voice-readiness.test.ts` |
| OpenAI and Foundry runtime streaming, continuation, recovery, cancellation, and failure mapping | `tests/agent-runtime-reliability.test.ts`, `tests/foundry-runtime.test.ts` |

## Live OpenAI evidence

All live output was written to temporary local files outside the repository. No API keys, provider identifiers, or raw private model traces were copied into this trail.

### Health and origin boundary

- Server started in live council mode with the OpenAI council and voice providers selected.
- `/api/health` reported live mode and voice enabled.
- An unapproved browser origin received HTTP 403 before any Live negotiation.

### Readiness defect found and fixed

The first live readiness request incorrectly returned the conservative fallback clarification even though the decision was complete. Direct reproduction showed the provider rejected the structured schema because `decisionQuestion` was declared as an optional property instead of a required nullable property.

Fix:

- Added a provider-facing `VoiceReadinessWireSchema` with every property required.
- Represents a missing `decisionQuestion` as `null` on the wire.
- Maps the verified wire result back to the application schema, where the field remains optional.
- Updated the mock runtime and added a regression assertion that every declared provider property is required.

Live verification after the fix:

- action: `convene`
- missing information: none
- decision question: present
- confidence: 0.99
- provider telemetry: present
- duration: 7.484 seconds

### Initial council round

- Stream events received: 19 public council events.
- Phase order: `ready` → `independent` → `cross_examining` → `synthesizing` → `completed`.
- All three specialists entered thinking, completed independent work, entered challenging, and completed.
- Final structured result: present and schema-valid.
- Result mode: `initial`.
- Confidence: 0.82.
- End-to-end server duration: 34.183 seconds.
- No council error event occurred.

### Material revision and reconvening

- Materiality assessment: material, confidence 0.99.
- The changed budget was preserved as the changed constraint.
- Impact Router marked all three specialists as affected.
- The previous verified Decision Scroll was supplied as prior context.
- Phase order: `ready` → `routing` → `independent` → `cross_examining` → `synthesizing` → `completed`.
- Final structured result: present and schema-valid.
- Result mode: `full`.
- Confidence: 0.82.
- End-to-end server duration: 42.848 seconds.
- No council error event occurred.

## Foundry status

Current automated tests passed for Foundry configuration selection, runtime behavior, voice event adaptation, response serialization, acknowledgements, transcript completion, and provider-neutral application intake.

A fresh live Foundry run was not possible from this checkout because:

- no complete local Foundry credential/deployment configuration was available;
- Azure CLI was not installed in this environment;
- historical hosted test evidence is not treated as proof of the current branch.

This is an untested lane, not a failure.

## Remaining owner-device acceptance matrix

Run the same scenario once with `VOICE_PROVIDER=openai` and once with `VOICE_PROVIDER=foundry`:

1. Start voice and speak the complete initial decision.
2. Confirm that Sutradhara reads back the captured question and waits.
3. Say “yes.” Confirm exactly one council round starts.
4. Confirm the three specialist cards follow real orchestration state.
5. Confirm the Decision Scroll appears and the verbal briefing is concise.
6. Ask “Why?” Confirm no council rerun.
7. State the INR 40,000 budget correction.
8. Confirm Sutradhara asks for explicit confirmation before reconvening.
9. Say “yes.” Confirm the prior Scroll remains visible until the replacement completes.
10. Confirm the new Scroll and concise spoken briefing correspond to the new revision.
11. Confirm audible playback separately from transcript rendering.

Capture for each provider:

- visible UI result;
- audible behavior witnessed by the owner;
- diagnostics showing completed turns, delegation binding where applicable, revisions, phases, append acknowledgements, and stale-result suppression;
- any provider error without copying secrets or provider identifiers into documentation.

## Gate to Step 4

Do not begin the voice transport split until both owner-device rows pass or a documented decision explicitly accepts one provider as temporarily unverified. Any failure discovered in this matrix should be repaired as a small pre-Step-4 change and independently retested.

## Owner-device result templates

Instructions and the exact spoken scenario are in [Dual-provider owner-device run guide](DEVICE_RUN_GUIDE.md). These sections are append-only evidence records. Replace `NOT RUN` only with an observed result from the named provider on this branch.

### Owner-device OpenAI

- Run date/time: `18 October 2026, approximately 08:14–08:19 IST`
- Branch HEAD: `3031b60`
- Tester/device/browser: `Owner / Mac mini / local in-app browser`
- Local or hosted: `Local`
- Runtime selection: `VOICE_PROVIDER=openai`, `COUNCIL_PROVIDER=openai`, GPT-Live model `gpt-live-1`, council and synthesis model `gpt-5.6-luna`; no local model and no Azure Foundry processing in this run
- Overall result: `ALL GOOD — QUALIFIED PASS (96.2%)`

The score covers the 13 applicable local checks below. Twelve passed fully and one—the spoken confirmation wording—passed functionally but is marked partial for UX quality. A partial is worth half a point: `(12 + 0.5) / 13 = 96.2%`. The hosted-origin row is out of scope and excluded. This clears the agreed 95% threshold for the OpenAI owner-device functional gate; it does not mean defect-free polish or complete the still-partial Foundry matrix.

| Check | Result | Evidence or timing |
| --- | --- | --- |
| Voice connected; greeting audible | PASS | GPT-Live session started, browser media played, and the owner completed the spoken run. |
| Decision read back accurately; council waited for approval | PARTIAL | The captured decision was handled by the confirmation gate and the council waited for “Yes.” However, OpenAI Sutradhara said words equivalent to “I’ll take that to the council” instead of clearly asking for confirmation. The state behavior passed; the spoken cue was misleading. |
| Confirmation-turn delegation used when present; otherwise stored decision delegation | PASS | The first-turn native delegation was retained and bound to revision 1 when the confirming turn carried no replacement delegation. |
| Exactly one initial council round after “Yes” | PASS | Exactly one initial `council.started` followed the completed approval turn. |
| Native delegation did not bypass confirmation | PASS | Native delegation was created with the decision turn, but no council started until the later “Yes.” |
| Cards showed thinking → challenging → done | PASS | Diagnostics traversed independent, cross-examining, synthesizing and completed phases. |
| Revision 1 Scroll and concise audible briefing completed | PASS | Initial synthesis completed at 82% confidence; thinking/commentary were acknowledged and audio playback started. |
| “Why?” used existing result without rerun | PASS | “Why?” was classified non-material at 0.99 confidence and answered from the verified result; no additional council round started. |
| INR 40,000 change required explicit confirmation | PASS | The change was classified material at 0.99 confidence, repeated back, and accepted only after “Yes.” |
| Previous Scroll remained visible during reconvening | PASS | Owner completed the prescribed full pass and observed the existing decision while the reconvening path ran; no retained screenshot was captured. |
| Revision 2 Scroll and audible briefing reflected INR 40,000 | PASS | Full reconvening completed with a revised 82%-confidence Scroll explicitly capped at ₹40,000; commentary was acknowledged and playback started. |
| Transcript and audible playback independently verified | PASS | Structured logs confirm completed transcripts, response creation and playback; owner reported that audio was largely okay. The confirmation wording issue is scored in its own row. |
| Local origin rejection/acceptance checks | PASS | An unapproved origin returned 403; the approved localhost origin reached SDP validation and returned the expected bounded 400 for an intentionally missing SDP payload. |
| Hosted configured-origin check, if in scope | NOT IN SCOPE | This was a local device run. |

- `council.started` count: `2` (one initial round and one full reconvening)
- Completed user turns: `5`
- Native delegations created: `2`
- Error-event count and bounded messages: `0` live/council errors in the observed OpenAI run
- Stale-result or cancellation failures: `0`
- Council provider calls: OpenAI Agents sessions using `gpt-5.6-luna`; no repair or recovery was required
- Cut-off, overlap, silence, or other anomalies: `One spoken confirmation-cue issue: the wording implied immediate handoff even though the application correctly waited for approval. Audio was otherwise reported as largely okay.`
- Screenshot filenames: `NOT RETAINED`
- Raw log location outside repository: `Private external validation archive, 2026-10-18-openai/ (not committed)`
- Owner audible-playback attestation: `PASS WITH NOTE — “Audio largely seemed okay.” The owner also observed that the OpenAI Sutradhara voice differed from Foundry; the shared council-handoff phrase sounded similar because its application-authored wording is provider-neutral.`

### Owner-device Foundry

- Run date/time: `18 October 2026, approximately 07:25–07:31 IST`
- Branch HEAD: `1ecd968` for the tested runtime; followed only by the documentation commit `2349ef1`
- Tester/device/browser: `Owner / Mac mini / local in-app browser`
- Local or hosted: `Local`
- Startup fail-fast check for missing/invalid voice configuration: `PASS — missing endpoint/key and non-HTTPS endpoint both failed with bounded named configuration errors`
- Overall result: `PARTIAL PASS — core initial and reconvening flow passed; prescribed scenario not completed in full`

| Check | Result | Evidence or timing |
| --- | --- | --- |
| Voice connected; greeting audible | PASS | Owner completed the spoken flow and reported that the run was fine; diagnostics recorded browser media playback. |
| Decision read back accurately; council waited for approval | PASS | Readiness resolved to convene, commentary was acknowledged, and the first council start occurred only after the next completed user turn. |
| Exactly one initial council round after “Yes” | PASS | One `council.started` event for conversation revision 2 / deliberation revision 1. |
| Cards showed thinking → challenging → done | PASS | Agent-state and council-phase logs reached independent, cross-examining, synthesizing and completed. |
| Revision 1 Scroll and concise audible briefing completed | PASS | The initial result completed; thinking, instructions and commentary were acknowledged before response/audio-start events. |
| “Why?” used existing result without rerun | NOT RUN | — |
| INR 40,000 change required explicit confirmation | NOT RUN | The run used an equivalent material market/apartment-size correction instead of the prescribed INR correction. |
| Previous Scroll remained visible during reconvening | NOT INDEPENDENTLY RECORDED | The application completed reconvening, but no retained screenshot was captured for this row. |
| Revision 2 Scroll and audible briefing reflected INR 40,000 | NOT RUN | The equivalent corrected scenario completed as a full reconvening and produced a revised Scroll and acknowledged briefing. |
| Transcript and audible playback independently verified | PARTIAL | Provider transcription, response creation, audio start and browser playback were logged; the owner reported the run was fine, but no word-for-word audio attestation was recorded. |
| Local WebSocket origin acceptance through browser | PASS | The browser completed Foundry relay negotiation and the full voice flow through `/api/live/foundry`. |
| Hosted configured-origin check, if in scope | NOT RUN | — |

- `council.started` count: `2` (one initial round and one full reconvening)
- Error-event count and bounded messages: `0` council/agent/live error events in the observed interval
- Speech-end to response-start observations: approximately `10.1 s` to decision read-back, `2.4 s` to initial council acknowledgement, `10.6 s` to constraint confirmation, and `2.5 s` to reconvening acknowledgement
- Cut-off, overlap, silence, or other anomalies: `None reported by the owner; multiple final ASR items were coalesced into bounded completed turns as designed`
- Screenshot filenames: `NOT RUN`
- Raw log location outside repository: `Private external validation archive, not committed`
- Owner audible-playback attestation: `Partial — owner reported “the run was fine”; exact spoken wording was not separately transcribed as an attestation`

### Owner-device Foundry completion run

This second Foundry run closes the three scenario gaps left by the earlier partial run while preserving that original record above.

- Run date/time: `18 October 2026, approximately 15:24–15:29 IST`
- Branch HEAD: `46fd44f`
- Tester/device/browser: `Owner / Mac mini / local in-app browser`
- Local or hosted: `Local`
- Runtime selection: `VOICE_PROVIDER=foundry`, `COUNCIL_PROVIDER=foundry`, Foundry voice model `gpt-realtime`, configured Foundry council deployment, `MOCK_COUNCIL=false`
- Overall result: `ALL GOOD — QUALIFIED PASS (95.5%)`

The score covers the 11 applicable local checks below. Ten passed fully and one—the initial `20-person` transcription/read-back—passed functionally but is marked partial for quality. A partial is worth half a point: `(10 + 0.5) / 11 = 95.5%`. The hosted-origin row is out of scope and excluded. This clears the agreed 95% threshold for the Foundry owner-device functional gate.

| Check | Result | Evidence or timing |
| --- | --- | --- |
| Voice connected; greeting audible | PASS | Health reported `voiceProvider: foundry`; Foundry media, response, audio-start and playback events were recorded throughout the completed run. |
| Decision read back accurately; council waited for approval | PARTIAL | The confirmation gate worked and waited for “Yes,” but the transcript/read-back rendered `20-person` as `20%`. The user approved the captured decision and the slip did not alter the requested pilot, constraints, lifecycle or recommendation. |
| Exactly one initial council round after “Yes” | PASS | The approval completed at 15:24:52 IST and exactly one initial `council.started` event followed. |
| Cards showed thinking → challenging → done | PASS | Both rounds traversed independent, cross-examining, synthesizing and completed phases. |
| Revision 1 Scroll and concise audible briefing completed | PASS | Initial synthesis completed at 82% confidence; quiet context and commentary were acknowledged and playback started. |
| “Why?” used existing result without rerun | PASS | “Why?” was classified non-material at 0.99 confidence, answered from the verified Scroll, and produced no council start. |
| INR 40,000 change required explicit confirmation | PASS | The exact ₹100,000 → ₹40,000 change was classified material at 0.99 confidence, repeated back, and accepted only after “Yes.” |
| Previous Scroll remained visible during reconvening | PASS | The owner completed the requested visual check during the reconvening sequence; no retained screenshot was added to the repository. |
| Revision 2 Scroll and audible briefing reflected INR 40,000 | PASS | Selective reconvening completed with a revised 75%-confidence Scroll explicitly capped at ₹40,000; commentary was acknowledged and playback started. |
| Transcript and audible playback independently verified | PASS | Five completed user turns, nine response/audio starts, acknowledged commentary and the owner-completed spoken sequence provide independent lifecycle and human evidence. |
| Local WebSocket origin acceptance through browser | PASS | The browser completed the Foundry relay connection and both council rounds through the configured Foundry voice path. |
| Hosted configured-origin check, if in scope | NOT IN SCOPE | This was a local device run. |

- `council.started` count: `2` (one initial round and one selective reconvening)
- Completed user turns: `5`
- Materiality outcomes: `Why?` → non-material at `0.99`; budget correction → material at `0.99`
- Error-event count and bounded messages: `0` live/council/agent errors in the observed completion run
- Stale-result or cancellation failures: `0`
- Provider-call behavior: the reconvening used six Foundry calls; three required bounded structured-output repair and all completed without recovery or terminal failure
- Cut-off, overlap, silence, or other anomalies: `No lifecycle failure observed. The only scored issue was the initial 20-person → 20% transcription/read-back slip.`
- Screenshot filenames: `NOT RETAINED`
- Raw log location outside repository: `Private external validation archive, 2026-10-18-foundry/ (not committed)`
