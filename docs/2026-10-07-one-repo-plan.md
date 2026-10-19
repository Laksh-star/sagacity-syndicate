# Sagacity Syndicate: one-repo plan

Date: 7 October 2026. Read-only review by Claude at Lakshmi's request. Nothing in the code was changed.

## Summary

Make the public `sagacity-syndicate` repo the single home for both providers, and archive `sagacity-foundry-port` once its code has moved across.

The port already runs OpenAI and Azure from one codebase, switched by `COUNCIL_PROVIDER` and `VOICE_PROVIDER`. Most of the merge is therefore done. What remains is one client-side refactor, three small fixes, a live retest of the OpenAI path, and a scrub before anything from the port becomes public.

## Status update — 19 October 2026

The plan above was the original read-only assessment. Work since then changed
its status without changing the destination:

- the baseline, explicit-confirmation ADR, provider configuration, origin,
  delegation, error-boundary and artifact-hygiene fixes are merged into the
  private port `main`;
- OpenAI and Foundry completed the local owner-device gate at 96.2% and 95.5%
  qualified acceptance respectively;
- the client transport split and its follow-up reliability fixes are merged into
  private port `main`: `LiveVoiceSession` retains shared turn and playback state
  while `OpenAIVoiceTransport` and `FoundryVoiceTransport` own their protocols;
- the public checkout's pre-existing documentation work is preserved on
  `preserve/docs-before-foundry-consolidation-2026-10-19`;
- a sanitized, squashed public migration candidate is prepared on
  `consolidation/foundry-one-repo-candidate-2026-10-19` in an isolated worktree;
- provider-neutral documentation and the strict public-candidate scan are part
  of that candidate;
- the remaining gates are one abbreviated post-migration owner-device run per
  provider, hosted-origin validation, public review/merge, and eventual port
  archival.

The public checkout's former uncommitted documentation work has been preserved
unchanged in a local safety commit. The migration candidate is built in a
separate worktree and does not overwrite that checkout.

## What the original review found

The council side is already provider-neutral; the client voice code is not.

| Area | State in this repo | Evidence |
| --- | --- | --- |
| Council runtime | Clean adapter | One `AgentRuntime` interface with mock, OpenAI and Foundry implementations, chosen in `server/index.ts`. The orchestrator, readiness and materiality checks see only the interface. |
| Server voice | Cleanly split | `server/live/session.ts` for OpenAI and `server/live/foundry-session.ts` for Azure, chosen by `VOICE_PROVIDER`. |
| Client voice | Branched, not split | `client/voice/live-session.ts` is one class with about 40 `if foundry` branches. It grew from 287 to 436 lines. |
| OpenAI path | Untested live since the port | The new intake behaviour sits in shared app code. FOUNDRY_PORT.md records no OpenAI voice run after those changes. |
| Documentation | Describes OpenAI only | The README and seven inherited documents predate the port. A replacement README is drafted. |

Three small defects:

1. **OpenAI voice cannot be hosted.** `/api/live/session` checks the request origin against a hardcoded localhost pattern and ignores `ALLOWED_ORIGINS`.
2. **The model name can cross providers.** `councilModel` and `synthesisModel` resolve `FOUNDRY_*` first even when the provider is `openai`, so a leftover Azure deployment name would be sent to OpenAI.
3. **Shared error messages still say "GPT-Live".** They appear on paths both providers use.

## Plan

Seven steps, in order. Steps 1 to 4 are small; step 5 is the largest piece of work.

| Step | What to do | Size | Who |
| --- | --- | --- | --- |
| 1. Keep one public home | Make `sagacity-syndicate` the surviving repo, since it is public and both Medium articles link to it. Bring this repo's code in as one squashed pull request. Archive this repo afterwards. | Small | Lakshmi or Instinct |
| 2. Scrub before it goes public | Work through the checklist below. | Small | Lakshmi |
| 3. Retest OpenAI live | Run one voice decision and one spoken reconvene on the merged code with OpenAI selected. Decide then whether the read-back-and-yes step applies to both providers. Recommended: keep it for both. | Small | Lakshmi (needs a microphone) |
| 4. Fix the three small defects | Use `ALLOWED_ORIGINS` for the OpenAI voice route, resolve model names by provider, and make shared error messages provider-neutral. | Small | Claude drafts, Instinct commits |
| 5. Split the client voice class | One transport per provider behind a shared interface. Keep turn tracking and playback common. The existing voice tests are the safety net. | Large | Claude drafts, Instinct commits |
| 6. Rewrite the docs for two providers | Fold DEPARTURES.md into a "provider differences" page. Adjust the drafted README so neither provider reads as the fork. Update or clearly mark the inherited documents. | Medium | Claude drafts |
| 7. Optional: a third council provider | Add one more `AgentRuntime` implementation for a text-only council on a third model. Voice stays on the two existing providers. | Medium | Decide after step 5 |

Step 7 is the cheapest proof of "same council, any vendor" for Directing Business, because the council side is a single interface.

Steps 4 and 5 should not start until step 3 has passed. Otherwise a refactor could hide a fault that the port's shared changes already introduced on the OpenAI path.

## Before the repo goes public

This repo was written as a private working record, so four things need attention before its contents reach a public repo.

- [x] **FOUNDRY_PORT.md.** Excluded from the public candidate; no private deployment record is tracked.
- [x] **The `social/` folder.** Excluded from the public candidate, including its images.
- [x] **Commit history.** Code and documentation are represented by one local candidate commit based on public `main`; private history is not included.
- [x] **Automated check.** `npm run check:public-candidate` passed against every tracked candidate file.

No keys were seen in the files reviewed. FOUNDRY_PORT.md states that the Foundry key lives only in App Service settings.

## What was not checked

This was a reading of selected files, not a full audit or a test run.

- **Read:** `server/index.ts`, `server/config.ts`, the first 70 lines of `server/agents/runtime.ts`, the first 180 lines of `client/voice/live-session.ts`, `.env.example`, DEPARTURES.md and FOUNDRY_PORT.md.
- **Not read:** `client/App.tsx` in full, `server/agents/foundry-runtime.ts`, `server/live/foundry-session.ts`, and the tests. How much of the new intake flow applies to the OpenAI path is therefore unconfirmed.
- **Not run:** no tests, builds or live calls. The figure of 130 passing tests comes from FOUNDRY_PORT.md.
- **Compared against:** the public original at commit `de708d8`.
