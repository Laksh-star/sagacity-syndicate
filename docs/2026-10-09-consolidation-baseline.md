# Consolidation baseline

Date: 9 October 2026
Scope: private baseline for the provider-consolidation safety branch. No public repository content was changed or pushed by this checkpoint.

## Repository anchors

| Repository | Anchor | Package-lock SHA-256 |
| --- | --- | --- |
| Private `sagacity-foundry-port` | `8f0446e75a60b5e2cd766255ed5f7bb41352a93f` | `9486a04a2faf56609b05f12f423bba874044f9ed8e2dd5e8ed731fbd8d5a3bb1` |
| Public `sagacity-syndicate` remote main | `de708d8ff7a2e76eddcecf9fcc7b4582a97b1228` | `7fbc91acb83ed21c595228ea374d6abfd678984f518f889c5bbd66872555e8b0` |

The repositories do not share a merge base. Consolidation must therefore use a reviewed, sanitized squash or file-level migration rather than merging histories.

## Private-port verification

Executed from a fresh private checkout at the anchor above:

```text
npm ci             PASS
npm run typecheck  PASS
npm test           PASS — 26 files / 130 tests
npm run build      PASS
```

`npm ci` reported four dependency advisories: one high and three critical. The same advisory set is present in the public baseline, so it is inherited rather than introduced by the Foundry port. Dependency remediation remains a separate reviewed change and is outside this consolidation-safety pass.

## Public working-copy preservation

The local public checkout contains uncommitted documentation work. This private branch does not modify, stash, commit, or overwrite it. The preserved paths observed at baseline were:

- `ARCHITECTURE.md`
- `FEATURE_MATRIX.md`
- `IMPLEMENTATION_NOTE.md`
- `PLAN.md`
- `README.md`
- `TEST_PLAN.md`
- `USER_GUIDE.md`
- the dated test trails under `docs/`
- untracked `docs/BEHIND_THE_SCENES.md`
- untracked `docs/sagacity-system-map.html`

## Boundary for this branch

- Work remains in the private port repository.
- No merge to either repository's `main` branch.
- No public push.
- No voice-transport split.
- The private port remains the rollback source until a later hosted pilot verifies a sanitized candidate.
