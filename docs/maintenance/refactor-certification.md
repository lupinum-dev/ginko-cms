# Refactor Reliability Certification

`pnpm run verify:refactor:live` is the fail-closed live lane for the greenfield
reliability refactor. It never treats a successful package build and an
unrelated running app as equivalent evidence.

## Required disposable inputs

Use a dedicated Convex deployment and a uniquely prefixed fixture set. The
automated accounts must be disposable and distinct from the owner credential
used manually in the in-app Browser.

```bash
GINKO_CMS_DISPOSABLE_DEPLOYMENT=1
GINKO_CMS_FIXTURE_PREFIX=refactor-unique-run-id
CONVEX_DEPLOYMENT=dev:dedicated-deployment
CONVEX_URL=https://dedicated-deployment.convex.cloud

GINKO_CMS_TEST_VIEWER_EMAIL=viewer-fixture@example.test
GINKO_CMS_TEST_VIEWER_PASSWORD=secret-manager-value
GINKO_CMS_TEST_EDITOR_EMAIL=editor-fixture@example.test
GINKO_CMS_TEST_EDITOR_PASSWORD=secret-manager-value
GINKO_CMS_TEST_PUBLISHER_EMAIL=publisher-fixture@example.test
GINKO_CMS_TEST_PUBLISHER_PASSWORD=secret-manager-value
GINKO_CMS_TEST_OWNER_EMAIL=owner-fixture@example.test
GINKO_CMS_TEST_OWNER_PASSWORD=secret-manager-value

CMS_STORY_BASE_URL=https://packed-candidate.example.test
CMS_STORY_CANDIDATE_ATTESTATION_URL=https://packed-candidate.example.test/.well-known/ginko-cms-candidate.json
GINKO_CMS_CANDIDATE_ARTIFACT=/absolute/path/to/.pack/candidate/candidate-artifact.json
# Optional override; defaults to scripts/consumer-live-fixtures.mjs.
GINKO_CMS_LIVE_FIXTURE_MODULE=/absolute/path/to/consumer-live-fixtures.mjs
CMS_STORY_CONTRACT_MISMATCH_URL=https://mismatched-packed-candidate.example.test
```

The legacy single-account `GINKO_CMS_TEST_EMAIL` and
`GINKO_CMS_TEST_PASSWORD` variables are rejected in certification mode. They
remain available only to the smaller, non-certification smoke command.
Every disposable role email must contain the exact fixture prefix so setup can
bind and cleanup can prove the four CMS memberships without scanning unrelated
identity data. Create the Better Auth accounts before the fixture hook runs.

## Exact packed-consumer attestation

The long-lived app at `CMS_STORY_BASE_URL` must expose a same-origin JSON
attestation. The source commit, version, commit, and SHA-256 for each of these
packages must match `candidate-artifact.json` byte for byte:

- `@lupinum/ginko-content`
- `@lupinum/ginko-cms-contract`
- `@lupinum/ginko-cms-convex`
- `@lupinum/ginko-cms`
- `better-convex-nuxt`

The endpoint shape is:

```json
{
  "schemaVersion": 1,
  "sourceCommit": "git-commit",
  "packages": {
    "@lupinum/ginko-cms": {
      "version": "0.2.0-rc.1",
      "commit": "git-commit",
      "sha256": "64-character-tarball-digest"
    }
  }
}
```

Serving a working-tree build or a different packed tuple fails the lane.

Materialize the exact candidate into a retained temporary consumer, then serve
that consumer in a dedicated terminal for the automated and in-app Browser
lanes:

```bash
pnpm run candidate:live:materialize
pnpm run candidate:live:serve
```

`candidate:live:materialize` requires the isolated Convex deployment variables
described above. It writes an ignored `.pack/live-candidate.json` pointer and
refuses to serve if the candidate manifest bytes or source commit change. After
finalization, remove only that validated temporary consumer with
`pnpm run candidate:live:cleanup`.

The serve command starts the matching candidate on port 3000 and a second build
from the same exact package tuple on port 3001. The latter deliberately changes
only the host content contract after deploying the canonical contract, so its
Studio is read-capable but write-blocked by a real hash mismatch. For the local
lane set `CMS_STORY_CONTRACT_MISMATCH_URL=http://localhost:3001`.

## Fixture hook contract

The fixture module is invoked as a Node program twice. Setup must create the
target-scale data and write the requested manifest:

```text
node consumer-live-fixtures.mjs setup \
  --output <manifest.json> \
  --prefix <refactor-prefix> \
  --seed <deterministic-seed> \
  --target-scale <json>
```

Cleanup is invoked even when the browser journey fails:

```text
node consumer-live-fixtures.mjs cleanup \
  --manifest <manifest.json> \
  --output <cleanup.json> \
  --prefix <refactor-prefix>
```

The setup manifest must declare the exact supported fixture counts (1,500
entries, three locales, 500 assets, depth five, 1,205 paginated rows, 4,500
live entry/locale rows, and the 5,000-document/500-asset portability boundary).
Setup first verifies all 500 seeded assets, then removes one disposable seed
row through the gated fixture cleanup path. The Browser upload journey must
recreate that reserved slot, returning discovery to exactly 500 assets without
ever crossing the supported boundary.
The deterministic non-live scale suite separately exercises 5,105 public rows
to cross the former 5,000-row boundary. The live manifest also
provides uniquely prefixed probe records for deep search, pagination, assets,
EN/DE review approval, MCP review gating, structural redirects, and deliberate
contract mismatch. `scripts/live-proof-config.mjs` is the executable schema and
the source of the target-scale constants.

The cleanup ledger reports integer `remaining` counts for entries, assets,
reviews, redirects, site data, MCP connections, and fixture members. The lane
passes cleanup only when the deployment was discarded or every remaining count
is zero. A boolean such as `cleanupAttempted` is not accepted as proof.

Fixture hooks receive deployment configuration and disposable account email
addresses, but the proof runner strips all role passwords before starting the
hook process. Hooks must not print deployment credentials.

## Measured browser evidence

Certification uses at least 20 samples for every p95 metric and writes the raw
samples, p95 result, budget, and pass/fail result to
`reports/refactor-proof/<commit>/live/browser/performance-summary.json`.

The enforced budgets are:

- Studio cold interactive: `< 2,500 ms p95`
- primary navigation and search/filter: `< 300 ms p95`
- list paging: `< 200 ms p95`
- long-editor keystroke response: `< 50 ms p95`
- publish preview: `< 2,000 ms p95`
- INP/Event Timing: `< 200 ms p95`
- CLS: `< 0.1 p95`

The same lane checks viewer/editor/publisher/owner authority, desktop/tablet/
narrow layouts, keyboard navigation, reduced motion, serious/critical axe
violations, page-level horizontal overflow, and unexpected console, page,
request, or HTTP failures. Expected wrong-password failure is scoped to that
single request; broad HTTP allowlists are not used.

It also creates localized EN/DE site data privately, exposes and updates it
through public reads, makes it private again, and permanently deletes the
fixture. Journey cleanup must prove that deletion alongside the archived smoke
entry, retired asset, completed MCP run, approved review, and revoked key.

Automated success is recorded as
`automated-live-green-in-app-browser-pending`. Final certification still
requires the separate requested in-app Browser journey; automated Playwright
does not impersonate that evidence.

The automated live command deliberately retains the uniquely prefixed fixture
after it turns green so the in-app Browser tests the same packed candidate and
data. Record the structured in-app evidence inside the proof browser directory,
then finalize and clean the disposable deployment:

```bash
GINKO_CMS_IAB_EVIDENCE=/absolute/path/to/in-app-browser-evidence.json \
  pnpm run verify:refactor:live:finalize
```

Finalization validates every required journey, the candidate artifact hash,
origin, commit, three viewport checks, accessibility and zero-failure
observability. Only then does it run fixture cleanup and change the proof status
to `green`. If the automated lane fails before the handoff, it cleans up
immediately.
