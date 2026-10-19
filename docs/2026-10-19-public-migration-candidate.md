# Public migration candidate

Date: 19 October 2026

Candidate branch: `consolidation/foundry-one-repo-candidate-2026-10-19`

Public baseline: `de708d8ff7a2e76eddcecf9fcc7b4582a97b1228`

## Purpose

This candidate moves the verified dual-provider implementation from the private
port into the public Sagacity Syndicate codebase as one reviewed change. It does
not merge repository histories and does not publish private working records.

## Preserved public work

The pre-existing documentation changes from the original public checkout were
committed unchanged to the local safety branch
`preserve/docs-before-foundry-consolidation-2026-10-19` at `6dd44b7` before the
candidate worktree was created. The candidate applies that work and then updates
it for the consolidated two-provider architecture.

## Included

- OpenAI and Foundry council runtime adapters behind `AgentRuntime`;
- OpenAI and Foundry browser voice transports behind `VoiceTransport`;
- explicit cross-provider captured-decision confirmation;
- confirmation-turn delegation precedence and idempotent late-event handling;
- provider-specific startup validation and provider-neutral shared errors;
- origin policy for local and configured hosted HTTPS origins;
- bounded output recovery and hard prompt/schema limits;
- current UI, revision safety, history, export, Council Map and diagnostics;
- automated tests for both provider paths;
- provider-neutral README, architecture, feature matrix, user guide and test plan;
- strict public-candidate text and image hygiene checks.

## Deliberately excluded

- `FOUNDRY_PORT.md`, which contains private deployment and dated working details;
- the port's `social/` directory and its images;
- `README-Claude.md`, an obsolete port-only draft;
- ignored `.env`, `logs/`, `node_modules/`, `dist/`, coverage and TypeScript build artifacts;
- the private port commit history.

## Automated verification

Fill after running against the final candidate commit:

| Check | Result |
| --- | --- |
| Clean install | PASS — 200 packages installed from lockfile |
| Typecheck | PASS |
| Automated tests | PASS — 34 files / 186 tests |
| Strict public-candidate hygiene | PASS — 137 public-scope files / 0 private-only files |
| Production build | PASS — 145 modules transformed |
| Whitespace check | PASS |
| Private-path absence | PASS — no `FOUNDRY_PORT.md` or `social/` content tracked |

`npm ci` reported the same inherited advisory class recorded at the consolidation
baseline: one high and three critical advisories. Dependency remediation remains
a separate reviewed change; `npm audit fix` was not run during migration.

## Owner-device result — OpenAI

- Date and candidate commit: `NOT RUN`
- Browser/device: `NOT RUN`
- Health provider: `NOT RUN`
- Captured read-back and explicit approval: `NOT RUN`
- Initial council and audible briefing: `NOT RUN`
- “Why?” without rerun: `NOT RUN`
- Four-week material correction and reconvening: `NOT RUN`
- Previous Scroll retained until replacement: `NOT RUN`
- Errors or anomalies: `NOT RUN`
- Overall: `NOT RUN`

## Owner-device result — Foundry

- Date and candidate commit: `NOT RUN`
- Browser/device: `NOT RUN`
- Health provider: `NOT RUN`
- Captured read-back and explicit approval: `NOT RUN`
- Initial council and audible briefing: `NOT RUN`
- “Why?” without rerun: `NOT RUN`
- Four-week material correction and reconvening: `NOT RUN`
- Previous Scroll retained until replacement: `NOT RUN`
- Errors or anomalies: `NOT RUN`
- Overall: `NOT RUN`

## Hosted-origin gate

- Candidate deployment URL recorded outside public documentation: `NOT RUN`
- Approved origin voice negotiation: `NOT RUN`
- Unapproved OpenAI origin rejected: `NOT RUN`
- Unapproved Foundry WebSocket origin rejected: `NOT RUN`
- Credentials confined to server settings: `NOT RUN`
- Overall: `NOT RUN`

## Release decision

Do not merge this candidate into public `main` or archive the private port until
both abbreviated owner-device rows and the hosted-origin gate have passed. Keep
the private port available as rollback through the hosted pilot.
