# ADR 0001: Require explicit confirmation before initial voice delegation

Date: 9 October 2026
Status: accepted for the consolidation candidate

## Context

Sagacity Syndicate supports two voice providers with different transport protocols:

- OpenAI GPT-Live can emit `session.delegation.created` in client-delegation mode.
- Azure Voice Live does not emit an equivalent application delegation event in this integration.

The product nevertheless needs one trustworthy intake policy. Voice transcripts can be incomplete or wrong, and the council is expensive enough that the user should see or hear the exact decision question before work starts.

OpenAI's client-delegation contract assigns permissions, confirmations, business records, and task state to the application. The delegation event provides an ID and timing metadata, not the task text. See the official [GPT-Live delegation guide](https://developers.openai.com/api/docs/guides/live-delegation).

## Decision

Both providers require the same read-back-and-confirm interaction before the initial council starts.

1. The application assembles a bounded decision question from completed user turns.
2. Sutradhara reads that question back and the UI displays it.
3. A later, explicit affirmative turn authorizes council execution.
4. Rejection or a corrected restatement returns to intake without starting the council.

For OpenAI, `session.delegation.created` remains meaningful but is not authorization:

- bind its delegation ID to the matching causal user turn;
- retain it with the pending decision capture;
- use it to correlate later thinking, commentary, and result updates after confirmation;
- never treat the causal turn itself as the user's confirmation;
- never start a duplicate round when the event arrives before, during, or after readiness assessment.

For Azure, application readiness creates the same pending capture without a native delegation ID. Confirmed work uses session-wide application updates where appropriate.

## Consequences

### Benefits

- One interaction contract across providers.
- A visible human checkpoint before a potentially costly council run.
- Corrections are handled before analysis instead of after an avoidable reconvening.
- OpenAI's native event remains observable and useful for task correlation.
- The application remains the only authority for council state and revisions.

### Costs

- One additional conversational turn before initial deliberation.
- OpenAI no longer auto-starts merely because the native event arrived.
- Provider adapters still require separate protocol tests even though the product interaction is shared.

## Rejected alternatives

### Restore automatic start only for OpenAI

Rejected because it creates a provider-dependent safety and interaction policy, expands the most failure-sensitive test matrix, and lets a transcript-derived provider event bypass the shared confirmation checkpoint.

### Ignore native OpenAI delegation events

Rejected because the event supplies a useful correlation ID and accurately represents GPT-Live's request for client-managed backend work. Ignoring it would make result routing and diagnostics weaker.

### Add a provider-specific demo toggle now

Deferred. A future demonstration may deliberately compare interaction policies, but it must be designed and tested separately. It is not part of consolidation.

## Required verification

- A late native delegation cannot clear or answer the pending captured question.
- Confirmation starts exactly one council round.
- The stored native delegation ID is attached to that round when available.
- No native event is required for Foundry confirmation to work.
- Rejection, correction, refresh, and duplicate-event behavior remain revision-safe.
