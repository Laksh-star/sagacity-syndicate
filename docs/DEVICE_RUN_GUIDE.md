# Dual-provider device release run

The original consolidation gate completed on 20 October 2026. Retain this guide
as the abbreviated device gate for any future change to a provider, model,
voice transport, confirmation flow, or hosted boundary. It validates the exact
commit intended for release. Allow approximately 5–8 minutes per provider.

Do not paste credentials, endpoint hostnames, provider identifiers, or raw logs
into tracked documentation. Keep credentials only in the ignored `.env` file.

## 1. Release preflight

```bash
cd /path/to/sagacity-syndicate
git status -sb
npm ci
npm run typecheck
npm test
npm run check:public-candidate
npm run build
```

Use the exact release branch or commit under review; for routine regression on
the authoritative repository, use current `main`. Create `.env` only when it is
absent:

```bash
cp .env.example .env
```

Allow microphone access for `http://localhost:5173`.

## 2. Short scenario

Use the same scenario for both providers:

> My consulting company needs more assignments. Should I prioritize LinkedIn
> outreach or Upwork? I can spend five hours a week for the next six weeks.

Then:

1. Wait for Sutradhara to read the captured decision back.
2. Say **Yes**.
3. Wait for the Decision Scroll and short spoken briefing.
4. Ask **Why?** and confirm no council reruns.
5. Say **Actually, the whole test must finish in four weeks, not six weeks.**
6. Confirm the reflected correction with **Yes**.
7. Wait for the revised Scroll and briefing.

Pass criteria:

- exactly one initial round and one reconvening round;
- the first council does not start before explicit approval;
- all three cards follow actual orchestration state;
- “Why?” uses the existing result;
- the prior Scroll remains visible while reconvening;
- revision 2 uses four weeks and becomes authoritative only after synthesis;
- the final briefing is concise and audible;
- no stale result, schema error, cut-off, or duplicate start occurs.

## 3. OpenAI run

Set:

```dotenv
MOCK_COUNCIL=false
COUNCIL_PROVIDER=openai
VOICE_PROVIDER=openai
OPENAI_API_KEY=<server-side key>
OPENAI_LIVE_MODEL=gpt-live-1
OPENAI_COUNCIL_MODEL=<available Agents model>
OPENAI_SYNTHESIS_MODEL=<available Agents model>
```

Run `npm run dev`, open the dashboard, and confirm:

```bash
curl -fsS http://localhost:8787/api/health
```

The response must include `"voiceProvider":"openai"`. During the scenario,
native delegation may appear, but it must not bypass confirmation. A delegation
on the confirmation turn takes precedence over the stored decision-turn event.

Stop the server before switching providers.

## 4. Foundry run

Set:

```dotenv
MOCK_COUNCIL=false
COUNCIL_PROVIDER=foundry
VOICE_PROVIDER=foundry
FOUNDRY_OPENAI_ENDPOINT=<Azure OpenAI v1 endpoint>
FOUNDRY_API_KEY=<server-side resource key>
FOUNDRY_COUNCIL_DEPLOYMENT=<council deployment>
FOUNDRY_SYNTHESIS_DEPLOYMENT=<synthesis deployment>
FOUNDRY_VOICE_ENDPOINT=<Foundry service HTTPS endpoint>
FOUNDRY_VOICE_MODEL=gpt-realtime
```

Run `npm run dev` and confirm health reports
`"voiceProvider":"foundry"`. Foundry must not emit a synthetic OpenAI delegation
event; explicit application confirmation starts the same council path.

## 5. Hosted-origin gate

Deploy this exact candidate behind the intended HTTPS origin with
`ALLOWED_ORIGINS` set to that origin. Verify:

1. the approved hosted page can establish the selected voice transport;
2. an unapproved origin receives HTTP 403 on OpenAI session negotiation;
3. an unapproved WebSocket origin cannot upgrade the Foundry relay;
4. credentials exist only in server settings;
5. the hosted health response names the intended voice provider.

This gate is required after a relevant hosted-boundary change. Local microphone
success does not prove hosted origin, authentication, or WebSocket policy. The
private port is intentionally retained unchanged as historical rollback; it is
not the active source of truth.

## 6. Record the result

Keep raw logs outside both repositories. Record only:

- date, candidate commit, provider and browser;
- pass/fail for the seven scenario steps;
- audible-playback observation;
- bounded error text, if any;
- `council.started` count and final revisions;
- whether the hosted-origin gate passed.

For a future release, update the public
[`VALIDATION_HISTORY.md`](VALIDATION_HISTORY.md) with only bounded outcomes and
keep the detailed evidence in the private archive. Do not push or merge a
release candidate until every applicable provider run and hosted-origin gate is
recorded honestly.
