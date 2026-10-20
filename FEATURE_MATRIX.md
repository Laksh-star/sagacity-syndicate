# Provider Feature Coverage and Roadmap

This matrix maps product-relevant OpenAI and Azure Foundry capabilities to
Sagacity Syndicate. It distinguishes four questions:

1. Does the platform offer the capability?
2. Does Sagacity use it now?
3. Does it fit this product?
4. If it fits, what would implementation require?

This is a practical product map, not an inventory of every administrative
endpoint. The OpenAI capability inventory retains the official references used
during implementation. The Foundry section records the capabilities actually
implemented and tested in this repository. Protocol differences are summarized
in [Provider differences](docs/PROVIDER_DIFFERENCES.md).

## Cross-provider implementation map

| Product capability | OpenAI | Azure Foundry | Shared application behavior |
| --- | --- | --- | --- |
| Voice conversation | GPT-Live over direct browser WebRTC | Voice Live over WebRTC plus server control relay | `LiveVoiceSession`, completed turns, push-to-talk and playback suppression |
| Initial handoff | Native delegation metadata may be attached | No native delegation is synthesized | Captured decision is read back and must be explicitly approved exactly once |
| Quiet verified context | Thinking append channel | Bounded translated system context | Verified Scroll facts only |
| Spoken briefing | Commentary append channel | Serialized provider response from the same Voice Brief facts | Short delivery; never reads the whole Scroll by default |
| Specialist execution | Managed Agents API sessions | Responses-compatible background calls | Three application-owned roles, parallel opinions, bounded critiques, synthesis |
| Continuation | Agent-session continuation | Previous-response continuation | Selective reconvening when safe; full rebuild after server restart |
| Cancellation | Agent input cancellation plus local abort | Provider cancellation plus local abort | Optimization only; revision checks remain authoritative |
| Structured output | JSON Schema plus local Zod validation | JSON Schema-compatible response plus local Zod validation | Same bounded schemas and no chain-of-thought fields |
| Status recovery | Session/turn/item inspection | Bounded response polling | Never treat uncertain `in_progress` work as success |
| Configuration safety | OpenAI models and API key | Foundry deployments, endpoints and resource key | Unsupported providers and incomplete selected-provider config fail fast |

The transport and runtime split is complete. Both providers passed the local
owner-device flow, and the merged public `main` subsequently passed the hosted
Azure Foundry voice, authentication, and origin-policy gate. Future provider,
model, or transport changes should repeat the abbreviated release gate in
[`TEST_PLAN.md`](TEST_PLAN.md); this is now a regression gate, not unfinished
consolidation work.

## Status legend

| Status | Meaning |
| --- | --- |
| **Used** | Implemented in the current repository. |
| **Partial** | The core capability is present, but a useful part is still missing. |
| **Not used** | Available from OpenAI but absent by design or not yet implemented. |
| **Not applicable** | Technically possible, but it does not currently serve this browser council. |

Priority uses **Now**, **Next**, **Later**, or **Avoid**. “Avoid” means the feature conflicts with a deliberate product boundary, not that the OpenAI feature is unsuitable in general.

## GPT-Live capability mapping

| GPT-Live capability | Status here | Current implementation | Can we add the missing part? | Fit and implementation path | Priority |
| --- | --- | --- | --- | --- | --- |
| Natural audio-in/audio-out conversation | **Used** | GPT-Live-1 is Sutradhara; browser microphone and generated speech use WebRTC media tracks. | Already present. | Keep GPT-Live responsible for conversational delivery, not council reasoning. | Now |
| Browser WebRTC connection | **Used** | `LiveVoiceSession` creates the peer connection and data channel; `/api/live/session` performs the trusted SDP exchange. | Already present. | Continue keeping the API key and session configuration on the server. | Now |
| WebRTC JSON event data channel | **Used** | The `oai-events` channel carries session, transcript, mute, delegation, append-acknowledgement, and error events. | Already present. | Extend the typed `LiveEvent` union as new events become necessary. | Now |
| Streaming input and output transcripts | **Used** | Transcript deltas update one in-progress `VoiceTurn`; they are not treated as standalone turns. | Already present. | Preserve turn aggregation and bounded history. | Now |
| Push-to-talk input control | **Used** | Holding enables the microphone track and sends unmute; release sends mute and starts turn finalization. | Already present. | This is the most predictable POC interaction model. | Now |
| Automatic voice activity detection | **Not used** | The app deliberately uses push-to-talk boundaries. | **Yes.** Add a hands-free setting, configure the documented turn-detection mode, consume speech-started/stopped events, and retain the settle/revision tests. | Useful for accessibility and longer conversations, but only after live barge-in and false-endpoint tests. | Later |
| Smooth conversational interruption / barge-in | **Used** | `LivePlaybackController` mutes browser model audio immediately on push-to-talk, keeps it suppressed through the user turn, rejects stale playback boundaries, and resumes on a post-turn Sutradhara response. | Already present and supervised with a real account on 15 September 2026; pointer-capture behavior was retested on 16 September. | Playback suppression is deliberately separate from materiality and council cancellation. | Now |
| Session instructions at creation | **Used** | `prompts/sutradhara.md` is loaded when the Live session is created. | Already present. | Keep moderator behavior separate from specialist prompts. | Now |
| Runtime instruction updates | **Used** | `session.instructions.append` communicates authoritative `NOT_STARTED`, `CLARIFYING`, `ACTIVE`, `COMPLETED`, and `FAILED` state. | Already present. | Continue treating application state as authoritative. | Now |
| Quiet context injection | **Used** | `session.thinking.append` receives bounded verified council facts for follow-up answers. | Already present. | Do not send raw agent output or private reasoning. | Now |
| Spoken result injection | **Used** | `session.commentary.append` receives only the bounded Voice Brief or one concise progress update. | Already present. | Preserve the 20–40 second briefing target. | Now |
| Append acknowledgement events | **Used** | The app correlates outgoing event IDs with `thinking.appended`, `commentary.appended`, and `instructions.appended`. | Already present. | Keep the UI/log wording precise: accepted context is not proof of audible playback. | Now |
| Delegation-specific and session-wide appends | **Used** | Appends use the native delegation ID when available and `delegation_id: null` for fallback or session context. | Already present. | This lets text-started or fallback work still brief an open voice session. | Now |
| Client delegation | **Used** | GPT-Live delegation metadata is retained and bound to the explicitly approved decision; it never bypasses the confirmation gate. | Already present. | This remains the right mode because the application must authorize, validate, and revision-check multi-agent output before speech. | Now |
| Responses delegation managed by GPT-Live | **Not used** | Sagacity does not let Live directly manage the decision backend. | Technically yes, but **not recommended** for the council path. | It would reduce custom glue but weaken explicit three-agent phases, selective reruns, and result validation. It could be evaluated only for a separate simple lookup feature. | Avoid for council |
| Explicit confirmed handoff | **Application-added** | Not a platform feature: `PendingDecisionCaptureController` stores the captured decision and optional delegation until a whole-turn approval starts exactly one council. | Already present. | Provider speech and delegation delivery are not authoritative application state. Confirmation-turn delegation wins; otherwise the stored decision-turn delegation is used. | Now |
| Live-managed tools / function calls | **Not used** | Sutradhara has no independent action tools. | **Yes, conditionally.** Register only narrow conversational utilities, add permissions and confirmation handling, and keep decision tools behind client delegation. | Avoid giving Sutradhara a second path to create decisions. A harmless UI-help tool could be appropriate later. | Later |
| MCP tools in the Live layer | **Not used** | No MCP server is exposed to Sutradhara. | **Yes, conditionally.** Add a narrowly scoped MCP connection and explicit approval policy. | Better attached to evidence-gathering Agents API sessions than to the moderator unless the interaction is purely conversational. | Later |
| Image or visual input | **Not used** | Voice intake is audio/text only. | **Yes.** Add an attachment control, validate file type/size, send visual input to the delegated backend, and return bounded findings to GPT-Live. | Useful for comparing offers, plans, or screenshots. Do not stuff raw images or long OCR into Live context. | Next |
| Typed context during an active voice session | **Used** | A precise typed correction becomes one completed application-owned user turn, mirrors a bounded fact through `session.thinking.append`, and enters the same revision-safe reconvening path as speech. | Already present. | Useful for names, figures, and links; it shares the same revision rules as speech. | Now |
| Application-owned material-change confirmation | **Used** | Material spoken changes enter durable `confirming_constraint` state. The app reflects bounded old/new values when available and reconvenes only after yes, an explicit UI confirmation, or a precise typed replacement. | Already present. | This follows client-delegation ownership: Live asks the question, while application state authorizes cancellation and the new backend revision. | Now |
| Configurable preset voice | **Used** | The Live session selects the `cedar` voice. | Already present. | A user preference can expose approved preset choices without changing decision behavior. | Later |
| Custom voice | **Not used** | No custom voice asset or consent workflow exists. | **Conditional.** Add only if the account supports it and the product has appropriate voice-consent and disclosure UX. | Low value for validating the decision-council concept. | Later |
| Server-side controls / sideband connection | **Not used** | Live commands travel from the browser data channel. | **Yes.** Open a trusted sideband session connection, route verified appends through the server, and correlate events there. | Could improve server-authoritative delivery and reconnect handling, but adds session lifecycle complexity. | Later |
| Primary WebSocket connection | **Not applicable** | The product is a browser voice UI, so WebRTC is used. | Yes, for a server-audio or non-browser client. | Do not add alongside WebRTC without a concrete server-side audio requirement. | Avoid now |
| Telephony / SIP | **Not applicable** | No phone interface exists. | Yes, as a separate channel adapter. | Requires call lifecycle, disclosure, consent, cost controls, and phone-specific testing. It does not improve the current browser POC. | Avoid now |
| Live session recording/download | **Not used** | The app does not persist audio. | Technically possible where supported, but not recommended by default. | Conflicts with the current privacy-minimizing design. Add only with explicit consent, retention, deletion, and access controls. | Avoid by default |
| Application context recovery across refresh | **Used** | The latest Scroll, Council Map trace, round mode, council ID, revisions, ten-entry decision history, and pending constraint confirmation restore from browser storage. A new Live connection receives bounded verified context; raw transcript and original prompt remain intentionally unpersisted. | Already present. Restoring the closed media connection itself is intentionally out of scope. | This is bounded task recovery, not continuation of a dead WebRTC session. | Now |

## OpenAI Agents API capability mapping

| Agents API capability | Status here | Current implementation | Can we add the missing part? | Fit and implementation path | Priority |
| --- | --- | --- | --- | --- | --- |
| Managed agent sessions | **Used** | Every opinion, critique, router, readiness, materiality, and synthesis call uses `client.beta.agents.sessions`. | Already present. | Managed sessions provide provider IDs, streaming events, continuation, cancellation, and inspection surfaces. | Now |
| Inline agent configuration | **Used** | Model, role instructions, verbosity, and JSON Schema are supplied per session. | Already present. | This keeps role prompts versioned in the repository and models environment-configurable. | Now |
| Saved reusable agents | **Not used** | No `agent_id` is stored; all role configuration is inline. | **Yes.** Provision saved agents, store IDs in environment variables, and retain local prompt/version metadata for reproducibility. | Useful only if prompt administration must move outside deployments. Inline config is clearer for this POC. | Later |
| Streaming session events | **Used** | The runtime consumes session-created, output-text-done, and failure events. The server then streams bounded council events to the browser. | **Partial expansion possible.** Capture usage and finer latency timestamps from supported session/turn events. | The UI should still show product phases, not every provider event. | Now |
| Structured JSON Schema output | **Used** | Each session gets a generated JSON Schema; output is parsed and validated again with Zod. | Already present. | This is the core defense against unconstrained multi-agent prose. | Now |
| Session continuation | **Used** | Specialist opinion sessions are continued on reconvening when a prior session ID exists. | Already present. | Continue only the affected specialists; start fresh critique and synthesis sessions. | Now |
| One repair turn for invalid output | **Application-added** | A malformed structured result receives one schema-repair continuation, then fails visibly. | Already present. | Keep the repair count bounded to avoid hidden loops and excess cost. | Now |
| Application-managed parallelism | **Used** | `Promise.all` runs the three independent opinions and selected critiques in parallel. | Already present. | This produces deterministic council membership and faithful card states. | Now |
| Native Agents API multi-agent/subagent orchestration | **Not used** | The council does not ask one provider agent to create and manage subagents. | Technically yes, but **not recommended now**. | It would obscure the explicit state machine, per-agent schemas, UI cards, selective reconvening, and stale-result guards. Evaluate only if the product later favors autonomy over inspectability. | Avoid now |
| Provider-side turn cancellation | **Used** | Superseded specialist sessions receive `agent.session.input.cancel` with a stable idempotency key; the local stream is also aborted. | **Can improve.** Capture terminal cancellation outcome events in telemetry when useful. | Provider cancellation saves work; revision checks remain the actual correctness boundary. | Now |
| Input-event idempotency | **Used** | Every cancellation request carries a stable SHA-256-derived key based on deliberation ID, revision, session ID, and purpose. | Already present. | Reuse the same pattern for future tool-result or retried message events. | Now |
| Session status retrieval | **Used** | If a provider stream fails after a session ID is known, the runtime retrieves status and polls a bounded recovery window when work remains `in_progress`. It never treats `idle` alone as success. | Already present. | A future recovery UI could expose only the bounded reconciled status to developers. | Now |
| Session/turn/item inspection | **Partial** | Stream recovery retrieves the latest turn, requires `turn.status === "completed"`, and reads completed final-answer items when streamed text is missing. Ordinary product UI does not copy provider histories. | **Yes.** Add a developer-only diagnostic endpoint for allowlisted metadata if repeated support needs justify it. | Keep reasoning items and sensitive input out of ordinary UI and logs. | Now / Later |
| Disconnected-stream recovery | **Used** | A known session in `in_progress` is polled for up to 30 seconds; after it becomes idle, the latest completed turn and final-answer item are validated instead of blindly rerunning uncertain work. | Already present with automated coverage; the repaired live run did not force a second broken stream. | Matches the official guidance that streams do not replay missed events and saved session state must be retrieved. | Now |
| Usage and token accounting | **Used** | Completed-turn usage and per-run duration are logged by stage, with an aggregate round telemetry event. | Already present. | Add a developer-only dashboard later if repeated model comparisons justify it. | Now |
| Metadata on sessions | **Used** | New sessions receive application, deliberation ID, conversation revision, deliberation revision, stage, and optional role metadata—never decision text or secrets. | Already present. | Provider and local diagnostics can now be correlated without copying private prompts into metadata. | Now |
| Explicit reasoning effort / summary configuration | **Not used** | The model default is accepted; no reasoning summary is stored or displayed. | **Yes.** Add per-role environment settings and benchmark quality, latency, and cost. | Do not expose raw reasoning; the bounded opinion/critique schemas remain the public explanation surface. | Later |
| Service-tier selection | **Not used** | The default service tier is accepted. | **Yes.** Add an optional environment variable and pass it through the inline agent config. | Useful only after usage/latency telemetry exists. | Later |
| Custom function tools | **Not used** | Specialists reason only over supplied decision context. | **Yes.** Define allowlisted, schema-bounded tools, handle `required_actions`, enforce user approval for side effects, and include citations in the final evidence model. | Useful for current facts such as prices or schedules. This is the strongest substantive extension after core reliability. | Next |
| Web search or other hosted tools | **Not used** | The council does not fetch current external evidence. | **Yes, subject to model/API support.** Add a research phase with source capture, timeouts, and a bounded evidence schema before specialist analysis. | Appropriate for decisions that depend on unstable facts; clearly separate sourced facts from council judgment. | Next |
| Evidence-aware confidence | **Partially used** | Decision Scroll confidence is recommendation confidence and is deterministically capped at 0.85 while key facts remain unverified. | **Yes.** Lift the cap only when a bounded evidence phase marks the recommendation's key facts verified. | Prevents specialist agreement from masquerading as factual certainty. | Now / Next |
| MCP tools and credential vaults | **Not used** | No external private system or vault is attached. | **Yes.** Create a vault, add narrowly scoped credentials, register MCP tools, and enforce permissions/confirmations in the application. | Useful for private offers, calendars, or company data, but materially increases security scope. | Later |
| Hosted execution environments | **Not used** | Sessions use `environment: { type: "none" }`. | **Yes.** Select an appropriate environment/template, pass files safely, and constrain tools and egress. | Useful for spreadsheet or document analysis; unnecessary for text-only decisions. | Later |
| Environment files/templates | **Not used** | No provider environment files are uploaded. | **Yes.** Validate uploads, create/reuse a template, and reference it from relevant sessions. | Add only with an evidence-upload workflow and retention policy. | Later |
| Durable session artifacts | **Not used** | The Decision Scroll is an application artifact in UI/logs, not an Agents API file artifact. | **Yes.** Publish/download artifacts from hosted turns when agents create files. | Not needed for the Scroll; a local Markdown/PDF export is simpler. Useful if future agents produce spreadsheets or reports. | Later |
| Vault IDs on sessions | **Not used** | No vaults are attached. | **Yes**, together with MCP/tool integration and a credential lifecycle. | Never add merely for convenience; it creates a new secret-management responsibility. | Later |
| Required-action handling | **Not used** | Sessions currently have no tools and therefore no tool-result loop. | **Yes.** Pause the turn, validate the requested tool call, obtain approval when required, execute, and submit a structured tool-result event. | Mandatory before adding any custom or MCP tool. | Next with tools |
| Session deletion and retention cleanup | **Not used** | Provider sessions are not currently deleted by an application retention job. Local product history is bounded independently. | **Yes.** Define a retention policy, save any required artifacts, then delete expired provider sessions through the documented session API. | Required before production or private-document workflows; unnecessary for proving the current local POC. | Later |
| Bounded council history across app restarts | **Used** | The newest authoritative Scroll restores directly, while the ten newest verified Scroll revisions remain in local browser history for comparison and Markdown export. | Already present. Provider session IDs and raw intake remain deliberately memory-only. | This provides useful local continuity without creating a transcript or provider-history datastore. | Now |

## Recommended implementation order

The missing features are not equally valuable. A sensible order is:

### 1. Reliability and measurement

Completed in the current repository:

1. Per-stage latency and best-effort Agents API usage logging.
2. Stable idempotency keys for cancellation input events.
3. Session-status reconciliation for uncertain stream failures.
4. Bounded latest-Scroll and revision recovery across refresh.
5. Provider metadata for application, stage, role, and revisions.
6. Decision history, Markdown export, and initial-versus-latest comparison.
7. Pointer-safe push-to-talk and supervised playback interruption.
8. Council Map with a bounded, peer-only trace.
9. Durable confirmation before material spoken corrections reconvene.
10. Recommendation-confidence calibration and public-artifact hygiene checks.

The confirmation, correction, and reconvening flow has automated and local
owner-device evidence on both providers. The exact merged public release also
passed an owner-authenticated hosted Azure Foundry run and the associated
authentication/origin rejection checks. Repeat the abbreviated release gate
only when a provider, model, voice transport, or hosted boundary changes.

These changes improve the current product without changing who holds decision authority.

### 2. Evidence-aware decisions

1. Add optional file/image attachment at intake.
2. Introduce a bounded `EvidenceItem` schema containing claim, source, retrieval time, and confidence.
3. Add read-only search or narrow custom tools to a separate evidence phase.
4. Feed only validated evidence into the three specialist sessions.
5. Extend the Scroll with citations only through a compatibility-reviewed schema amendment.

Tools must remain read-only initially. Any later side-effecting action needs an explicit user confirmation and audit trail.

### 3. Conversation convenience

1. Add optional hands-free VAD while retaining push-to-talk as a reliable fallback.
2. Add approved preset voice selection.
3. Typed corrections during voice are implemented as explicit revisioned turns.
4. Consider sideband server controls only if browser reconnect and delivery evidence justify the added complexity.

### 4. Features to defer deliberately

- Do not replace the explicit council with native subagent orchestration until equivalent phase, schema, and stale-result guarantees can be demonstrated.
- Do not replace client delegation with Responses delegation for the council path; it would create a competing orchestration model.
- Do not give Sutradhara independent decision or action tools.
- Do not record Live audio by default.
- Do not add SIP, an additional voice transport, vaults, or hosted execution environments without a concrete product use case.

## Decision test for any new provider feature

Before adding a capability, answer these questions:

1. Does it improve decision quality, voice usability, reliability, or observability?
2. Does it preserve the Decision Scroll as the single source of truth?
3. Can its output be bounded and validated?
4. Does it respect `conversationRevision` and `deliberationRevision`?
5. Can late output be prevented from rendering or speaking?
6. Does it introduce permissions, credentials, retention, or user-confirmation requirements?
7. Can it be tested in mock mode and then verified in a real-account browser session?

If the answer to questions 2–5 is no, the feature should not enter the council path.

See the [Architecture Guide](ARCHITECTURE.md) for the system diagrams and the [User Guide](USER_GUIDE.md) for the product workflow.
