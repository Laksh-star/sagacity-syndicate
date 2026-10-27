# Validation history

Last updated: 27 October 2026

This is the public, privacy-bounded validation record for Sagacity Syndicate.
It summarizes release evidence without publishing raw transcripts, real
decision artifacts, local deliberation identifiers, provider identifiers,
deployment hostnames, or private operational notes.

## Current automated gate

The consolidated public release passed:

- TypeScript typecheck;
- 34 test files / 190 automated tests;
- production Vite build with 145 transformed modules;
- strict public-artifact hygiene with no private-only files;
- Markdown link and whitespace checks; and
- dependency audit with zero known vulnerabilities after refreshing Express,
  Vite, Vitest, Zod, and the fixed transitive body-parser release;
- a Node 22 runtime contract through `package.json` and `.nvmrc`; and
- a least-privilege GitHub Actions workflow that runs the same `npm run verify`
  release gate on every pull request and push to `main`.

Automated coverage includes:

- bounded specialist, critique, Voice Brief, materiality, and Scroll schemas;
- independent analysis, cross-examination, synthesis, and selective or full
  reconvening;
- conversation and deliberation revision safety;
- transcript aggregation and completed-turn boundaries;
- explicit decision approval and exactly-once council start;
- non-material interjections and material-change confirmation;
- stale UI, quiet-context, and commentary suppression;
- OpenAI and Foundry transport and runtime adapters;
- provider interruption, recovery, and restart hydration;
- push-to-talk playback suppression and pointer boundaries;
- decision history, export, comparison, and Council Map integrity; and
- origin policy, owner checks, and public-artifact scanning.

## Supervised browser milestones

| Milestone | Result | What it established |
| --- | --- | --- |
| Initial text and OpenAI voice flows | Passed | Both intake paths reached the same bounded council and Decision Scroll |
| Follow-up exploration | Passed | Questions about a completed decision reused verified Scroll context without unnecessary reruns |
| Typed and spoken material changes | Passed | Confirmed constraints produced new revisions while prior output remained authoritative |
| Browser refresh and server restart | Passed | Bounded client state and server hydration restored a coherent council context |
| Push-to-talk drift and barge-in | Passed | Pointer movement did not prematurely finalize speech; stale playback stayed suppressed |
| Council Map | Passed | Three distinct positions and peer-only critique edges projected validated council artifacts |
| OpenAI owner-device gate | Qualified pass | Read-back, approval, council, briefing, exploration, and material reconvening completed |
| Foundry owner-device gate | Qualified pass | The equivalent shared product contract completed over Foundry voice and council adapters |
| Authenticated Azure Foundry pilot | Passed | The exact public release completed spoken intake through audible briefing behind the hosted access boundary |

The provider-specific owner-device scores were above the agreed 95% acceptance
threshold. Deductions reflected minor speech/wording quality observations rather
than failures of council authority, revision safety, or result delivery.

## Hosted boundary result

The hosted Azure pilot verified:

- Microsoft Entra authentication before application access;
- an application owner-principal check;
- the approved HTTPS origin establishing Foundry voice;
- anonymous, forged-identity, and unapproved-origin requests being rejected;
- provider credentials remaining in server configuration; and
- the browser receiving the complete Decision Scroll and short spoken briefing.

The deployment identity, resource names, principal identifiers, and raw logs
are intentionally absent from this public record.

## What this evidence does not claim

- Automated tests do not prove microphone permission or audible playback.
- One supervised owner-device run does not establish multi-user production
  readiness, an SLO, or cross-device compatibility.
- Recommendation confidence is not factual certainty; the council currently
  has no external evidence-gathering phase.
- Provider recovery is tested deterministically, but every possible network
  failure cannot be forced during a live session.

## Repeating the gate

Run the complete [Test plan](../TEST_PLAN.md) for significant orchestration or
schema changes. Use the abbreviated [Device run guide](DEVICE_RUN_GUIDE.md)
after changing a provider, model, voice transport, confirmation flow,
authentication rule, or hosted origin.

Keep raw logs and transcripts out of Git. Record only bounded results, observed
pass/fail status, and clearly stated limitations.
