# Marketer Publishing Agent Task Packets

> **Superseded architecture record.** These pre-greenfield task packets are
> retained only as decision history. They are not current implementation
> guidance or acceptance evidence. Use the [canonical content model](../../reference/content-model.md),
> [Studio workflows](./workflows.md), [contract transition guide](../../guides/changing-collections.md),
> and [recovery boundaries](../../maintenance/backup-and-recovery.md). References
> below to `publicRoutes`, descendant route-row rewrites, Studio imports, legacy
> content migrations, CMS backup tables, or old scale ceilings are obsolete.

This file contains ready-to-run task packets for coding agents and reviewer
agents.

Use this file with:

- `docs/concepts/studio/marketer-publishing-pipeline.md`
- `docs/concepts/studio/marketer-publishing-implementation-plan.md`
- `docs/concepts/studio/marketer-publishing-agent-success-protocol.md`
- `docs/concepts/studio/marketer-publishing-agent-experiments.md`

## General Instructions For Every Implementer Packet

Include this block in every implementer prompt:

```txt
You are implementing one narrow packet of the Ginko CMS marketer publishing
refactor.

Required rules:

- Read AGENTS.md first.
- Read the assigned sections of:
  - docs/concepts/studio/marketer-publishing-pipeline.md
  - docs/concepts/studio/marketer-publishing-implementation-plan.md
  - docs/concepts/studio/marketer-publishing-agent-success-protocol.md
- Inspect current code before editing.
- Add or update failing invariant tests before implementation when new behavior
  is introduced.
- Prefer delete > simplify > replace > add.
- Do not add stored workflow state.
- Do not create duplicate readiness truth.
- Do not put backend invariants in Vue components.
- Do not make public provider read draft/editor readiness.
- Do not let MCP bypass Convex operations.
- Do not widen public package exports unless this packet explicitly says so.
- Do not manually edit generated files.
- Do not revert unrelated user changes.
- Run the focused commands listed in this packet.
- Report any tests not run.

Stop and report instead of continuing if:

- The task requires a new database table not listed in the packet.
- The task requires changing a released public API not listed in the packet.
- The task requires choosing between architecture options not decided in the docs.
- The implementation would publish descendant draft content during subtree route
  rebuild.
- Public provider would need draft/readiness access.
- MCP would need raw table writes.
```

## General Instructions For Every Reviewer Packet

Include this block in every reviewer prompt:

```txt
You are reviewing one packet of the Ginko CMS marketer publishing refactor.

Review stance:

- Findings first.
- Focus on bugs, invariant gaps, duplicate truth, missing tests, and source-of-
  truth drift.
- Use file and line references.
- Do not praise or summarize before findings.
- Say clearly whether the packet can proceed.

Must check:

- Did the implementation add stored workflow state?
- Did it preserve an old parallel readiness path?
- Did it put backend invariants in frontend code?
- Did it widen public exports unnecessarily?
- Did it let MCP bypass operations?
- Did it let public provider read draft/readiness state?
- Did it include negative invariant tests?
- Did it run the focused commands?
- Did it leave old code behind that should have been deleted?
```

## Implementer Packet 1: Vocabulary Types And Validators

````txt
Task Packet 1: Vocabulary Types And Validators

Objective:

Add the canonical readiness state, issue, and action vocabulary. Keep the full
readiness detail shape internal unless explicitly needed by tests.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Canonical Readiness States
  - Readiness Issue Code Registry
  - Readiness Action Code Registry
  - Phase 1: Contract Vocabulary And Internal Types
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Agent Operating Rules
  - Packet 1: Vocabulary Types And Validators
- packages/contract/src
- packages/contract/package.json
- test/shared/studio-workflow.test.ts

In scope:

- Add readiness state constants/types.
- Add readiness issue code constants/types.
- Add readiness action kind constants/types.
- Add validators for states, issue codes, action kinds, and action targets.
- Add type/runtime tests.

Out of scope:

- No readiness computation.
- No Studio UI migration.
- No MCP tool changes.
- No subtree rebuild.
- No full public export of experimental detail shape unless already approved.

Required tests first:

- Unknown readiness state fails validation.
- Unknown issue code fails validation.
- Unknown action kind fails validation.
- Issue/action params are JSON-safe.

Commands:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts
pnpm run typecheck
```

Completion criteria:

- Tests pass.
- No UI copy moved into contract.
- No stored workflow state added.
- Public exports are minimal and intentional.
````

## Reviewer Packet 1: Vocabulary Types And Validators

```txt
Reviewer Packet 1: Vocabulary Types And Validators

Review the diff for Packet 1.

Required checks:

- Are readiness states exactly the accepted vocabulary?
- Are issue/action codes stable and not marketer copy?
- Are validators strict?
- Did public exports widen only where justified?
- Are experimental detail shapes kept internal?
- Are type/runtime tests meaningful?
- Was any stored workflow state added?

Output findings first with file/line references.
```

## Implementer Packet 2: Exact Readiness Fixture Tests

````txt
Task Packet 2: Exact Readiness Fixture Tests

Objective:

Add failing tests for exact readiness detail before implementing the engine.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 0
  - Phase 2
  - Invariant Test Matrix
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 2: Exact Readiness Fixture Tests
- test/component/entries/helpers.ts
- test/component/diagnostics.test.ts
- test/shared/studio-workflow.test.ts

In scope:

- Add fixtures needed for readiness detail tests.
- Add failing tests for all readiness states.
- Add failing tests for required fields.
- Add failing tests for configured missing locales.
- Add failing tests for data-only required-field publish blocking.

Out of scope:

- Do not implement the readiness engine in this packet.
- Do not migrate UI.
- Do not change publish execution.

Commands:

```bash
pnpm exec vitest run test/component/diagnostics.test.ts test/shared/studio-workflow.test.ts
```

Completion criteria:

- Tests fail for missing implementation, not because fixtures are broken.
- Tests include negative invariants.
- Tests do not require public provider draft/readiness reads.
````

## Reviewer Packet 2: Exact Readiness Fixture Tests

```txt
Reviewer Packet 2: Exact Readiness Fixture Tests

Review the failing tests and fixtures.

Required checks:

- Do tests cover every readiness state?
- Do tests cover data-only required-field blocking?
- Do tests cover configured missing locales?
- Do tests prevent frontend-owned readiness?
- Are fixtures reusable for later packets?
- Are failures caused by missing implementation, not bad setup?
```

## Implementer Packet 3: Exact Readiness Engine

````txt
Task Packet 3: Exact Readiness Engine

Objective:

Implement backend exact per-entry/per-locale readiness detail from canonical
Convex state.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Exact Readiness Algorithm
  - State Derivation Order
  - Required Field Rules
  - Review State Rules
  - Permission Rules
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 3: Exact Readiness Engine
- packages/convex/src/diagnostics.ts
- packages/convex/src/entries/read.ts
- packages/convex/src/settings.ts
- test/component/diagnostics.test.ts
- test/shared/studio-workflow.test.ts

In scope:

- Implement exact readiness detail query/helper.
- Derive states for configured locales.
- Derive blockers/warnings/actions.
- Include permission booleans.
- Include affected public URLs where currently computable.

Out of scope:

- Do not implement subtree execute.
- Do not migrate Studio UI.
- Do not add stored readiness rows.
- Do not call public provider.

Commands:

```bash
pnpm exec vitest run test/component/diagnostics.test.ts test/shared/studio-workflow.test.ts
pnpm run typecheck
```

Completion criteria:

- Every readiness state test passes.
- Required-field tests pass.
- Data-only publish blocking tests pass.
- Missing configured locale tests pass.
- No backend UI copy returned as truth.
````

## Reviewer Packet 3: Exact Readiness Engine

```txt
Reviewer Packet 3: Exact Readiness Engine

Review exact readiness implementation.

Required checks:

- Is readiness derived from canonical rows?
- Is there any stored workflow state?
- Are states per-locale?
- Are required fields enforced for data-only and route-backed collections?
- Does public provider remain untouched?
- Are issue/action codes stable?
- Are Vue components untouched except type wiring if necessary?
```

## Implementer Packet 4: Cheap Workflow Summary

````txt
Task Packet 4: Cheap Workflow Summary

Objective:

Implement cheap dashboard/list workflow summaries using the same readiness
vocabulary without running full exact preview for every row.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 3: Cheap Workflow Summary Engine
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 4: Cheap Workflow Summary
- packages/convex/src/entries/read.ts
- test/component/entries/read.test.ts
- test/shared/studio-workflow.test.ts

In scope:

- Add `computeEntryWorkflowSummary`.
- Use same state/issue/action vocabulary.
- Add summary tests.
- Update dashboard data query only if needed for test coverage.

Out of scope:

- Do not run full exact publish preview for every row.
- Do not migrate dashboard UI broadly.
- Do not invent dashboard-only states.

Commands:

```bash
pnpm exec vitest run test/component/entries/read.test.ts test/shared/studio-workflow.test.ts
```

Completion criteria:

- Summary tests pass.
- Summary is conservative.
- Summary does not become a second source of truth.
````

## Implementer Packet 5: Locale And Provider Foundation

````txt
Task Packet 5: Locale And Provider Foundation

Objective:

Make locale/default-locale ownership reliable and keep public provider
published-only.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 4: Locale And Public Provider Foundation
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 5: Locale And Provider Foundation
- packages/convex/src/settings.ts
- packages/cms/src/nuxt-provider.mjs
- packages/cms/src/module/i18n.ts
- test/component/public-api.test.ts
- test/module/module-i18n.test.ts
- test/refactor/provider-contract.test.ts

In scope:

- Remove hardcoded provider default locale.
- Ensure non-en default locale works.
- Ensure configured missing locales appear in readiness.
- Ensure missing configured locales do not appear as public content.

Out of scope:

- Do not make provider read readiness detail.
- Do not make provider read draft rows.
- Do not implement fallback chains beyond accepted rules.

Commands:

```bash
pnpm exec vitest run test/component/public-api.test.ts test/module/module-i18n.test.ts test/refactor/provider-contract.test.ts
pnpm run typecheck
```

Completion criteria:

- Provider remains published-only.
- Non-en default locale tests pass.
- Missing configured locale behavior is tested.
````

## Implementer Packet 6: Review Preview Server Truth

````txt
Task Packet 6: Review Preview Server Truth

Objective:

Make Convex compute and store review preview/summary. Caller-provided preview
JSON must not become review truth.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 5: Canonical Publish, Review, And Agent Operations
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 6: Review Preview Server Truth
- packages/convex/src/reviewRequests.ts
- packages/cms/src/server/mcp/tools/content/request-publish-review.ts
- test/component/reviewRequests.test.ts
- test/runtime/mcp-request-publish-review.test.ts

In scope:

- Change review request creation to compute preview in Convex.
- Store marketer-safe review summary.
- Store version/hash data.
- Add spoofed-preview tests.
- Add stale-review tests.

Out of scope:

- Do not implement direct agent publish.
- Do not migrate review UI broadly.
- Do not duplicate publish execution semantics.

Commands:

```bash
pnpm exec vitest run test/component/reviewRequests.test.ts test/runtime/mcp-request-publish-review.test.ts
```

Completion criteria:

- Spoofed preview cannot be stored as truth.
- Review creation computes backend preview.
- Stale review behavior is tested.
````

## Implementer Packet 7: Canonical Publish Path And Agent Publish

````txt
Task Packet 7: Canonical Publish Path And Agent Publish

Objective:

Make manual publish, review approval, and authorized agent publish share one
canonical backend operation path.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 5
  - Agent Matrix
  - Review Matrix
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 7: Canonical Publish Path
- packages/convex/src/entries/publish.ts
- packages/convex/src/operationHelpers.ts
- packages/convex/src/reviewRequests.ts
- packages/cms/src/server/mcp/tools/content
- test/component/reviewRequests.test.ts
- test/component/entries/publish.test.ts
- test/runtime/mcp-preview-publish.test.ts

In scope:

- Centralize publish execution semantics.
- Make review approval use canonical path.
- Add authorized agent publish.
- Add unauthorized agent fail-closed behavior.
- Add audit/revalidation parity tests.

Out of scope:

- Do not implement subtree route rebuild.
- Do not migrate Studio UI.
- Do not bypass destructive confirmation rules.

Commands:

```bash
pnpm exec vitest run test/component/reviewRequests.test.ts test/component/entries/publish.test.ts test/runtime/mcp-preview-publish.test.ts
pnpm run typecheck
```

Completion criteria:

- Manual publish and agent publish produce equivalent projection/audit/revalidation semantics.
- Review approval re-checks current preview.
- Unauthorized agent publish fails closed or requests review by contract.
````

## Implementer Packet 8: Subtree Preview

````txt
Task Packet 8: Subtree Preview

Objective:

Compute affected descendant public URLs and route collision blockers before
parent route publish.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 6: Automatic Subtree Route Rebuild
  - Subtree Preview Algorithm
  - Subtree Collision Rules
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 8: Subtree Preview
- packages/convex/src/entries/workflow/commands.ts
- packages/convex/src/entries/projections.ts
- packages/convex/src/diagnostics.ts
- test/component/entries/publish.test.ts
- test/component/diagnostics.test.ts

In scope:

- Add descendant traversal helper.
- Add deterministic preview of affected descendant URLs.
- Add route collision preflight.
- Add dirty descendant fixture.
- Add preview tests.

Out of scope:

- Do not execute subtree rebuild yet.
- Do not publish descendant drafts.
- Do not add redirects.

Commands:

```bash
pnpm exec vitest run test/component/diagnostics.test.ts test/component/entries/publish.test.ts
```

Completion criteria:

- Preview lists child and grandchild URL changes.
- Preview blocks route collisions before mutation.
- Dirty descendant fixture exists for execute packet.
````

## Implementer Packet 9: Subtree Execute

````txt
Task Packet 9: Subtree Execute

Objective:

Execute automatic subtree route rebuild during parent route publish while
preserving descendant published content and dirty drafts.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Subtree Execute Algorithm
  - Subtree Revalidation Rules
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 9: Subtree Execute
- packages/convex/src/entries/workflow/commands.ts
- packages/convex/src/entries/workflow/projection.ts
- packages/convex/src/entries/projectionMaintenance.ts
- packages/convex/src/revalidation.ts
- test/component/entries/publish.test.ts
- test/component/public-api.test.ts
- test/refactor/provider-contract.test.ts

In scope:

- Rebuild descendant public projections.
- Rebuild descendant public routes.
- Replace descendant public asset refs.
- Emit old and new URL revalidation.
- Preserve descendant dirty locale state.
- Preserve descendant published content.

Out of scope:

- Do not publish descendant draft content.
- Do not clear descendant dirty locales.
- Do not add automatic redirects.
- Do not append descendant content revisions unless a route-only revision kind is explicitly designed.

Commands:

```bash
pnpm exec vitest run test/component/entries/publish.test.ts test/component/public-api.test.ts test/refactor/provider-contract.test.ts
pnpm run typecheck
```

Completion criteria:

- New descendant routes resolve.
- Old descendant routes no longer resolve unless redirects are later added.
- Descendant draft content remains unpublished.
- Revalidation includes old and new URLs.
````

## Implementer Packet 10: Studio Entry Migration

````txt
Task Packet 10: Studio Entry Migration

Objective:

Render backend readiness detail in the entry editor and remove local
publishability decisions.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 7: Studio Entry Editor Migration
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 10: Studio Entry Migration
- packages/cms/studio-app/src/pages/[collection]/[id].vue
- packages/cms/studio-app/src/lib/publicWorkflow.ts
- packages/cms/studio-app/src/composables/internal/useEntryPublishing.ts
- packages/cms/studio-app/src/components/studio/editor
- test/shared/studio-workflow.test.ts
- test/runtime/studio-workflow-components.test.ts

In scope:

- Wire readiness detail.
- Map state/issue/action codes to Studio copy.
- Update rail.
- Update publish dialog.
- Update translation readiness.
- Keep developer diagnostics.
- Delete replaced local readiness rules.

Out of scope:

- Do not change backend readiness semantics.
- Do not hide developer diagnostics completely.
- Do not change dashboard yet.

Commands:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts test/runtime/studio-workflow-components.test.ts
pnpm run typecheck
```

Completion criteria:

- Studio renders backend readiness.
- Vue does not decide publishability.
- Old local readiness helpers are deleted or reduced to copy mapping.
````

## Implementer Packet 11: Dashboard And Review UI Migration

````txt
Task Packet 11: Dashboard And Review UI Migration

Objective:

Use workflow summary for dashboard and Convex-computed review summaries for the
review inbox.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 8: Dashboard And Review Inbox Migration
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 11: Dashboard And Review UI Migration
- packages/cms/studio-app/src/pages/index.vue
- packages/cms/studio-app/src/pages/reviews.vue
- packages/convex/src/entries/read.ts
- packages/convex/src/reviewRequests.ts
- test/shared/studio-workflow.test.ts
- test/component/reviewRequests.test.ts

In scope:

- Dashboard lanes use `EntryWorkflowSummary`.
- Review cards use Convex-computed review summary.
- Raw preview JSON moves to developer details.
- Add rendering tests.

Out of scope:

- Do not run exact readiness for every dashboard row.
- Do not change publish execution.

Commands:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts test/component/reviewRequests.test.ts
```

Completion criteria:

- Dashboard is cheap and vocabulary-aligned.
- Review cards are marketer-readable.
- Developer details remain available.
````

## Implementer Packet 12: MCP Hardening

````txt
Task Packet 12: MCP Hardening

Objective:

Make MCP tools first-class, powerful, authenticated, scoped, redacted, and
operation-based.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 9: MCP And Agent Tooling
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 12: MCP Hardening
- packages/cms/src/server/mcp
- packages/convex/src/mcpCredentials.ts
- packages/convex/src/agentRuns.ts
- test/runtime/mcp-auth-middleware.test.ts
- test/runtime/mcp-preview-publish.test.ts
- test/runtime/mcp-request-publish-review.test.ts
- test/runtime/mcp-response-redaction.test.ts

In scope:

- Add readiness detail tool.
- Update request-review tool.
- Add authorized publish tool.
- Add archive/restore tools.
- Add scope tests.
- Add redaction tests.

Out of scope:

- No raw table writes.
- No unscoped write tools.
- No secret leakage.

Commands:

```bash
pnpm exec vitest run test/runtime/mcp-request-publish-review.test.ts test/runtime/mcp-preview-publish.test.ts test/runtime/mcp-auth-middleware.test.ts test/runtime/mcp-response-redaction.test.ts
pnpm run typecheck
```

Completion criteria:

- MCP writes go through Convex operations.
- Auth and scopes are tested.
- Diagnostics are redacted.
````

## Implementer Packet 13: Cutover And Deletion

````txt
Task Packet 13: Cutover And Deletion

Objective:

Delete old duplicate paths after new readiness, publish, review, Studio, MCP,
and subtree paths are green.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
  - Phase 11: Hard Cutover And Deletion
  - Final Definition Of Done
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
  - Packet 13: Cutover And Deletion

In scope:

- Search for old helper names.
- Delete obsolete internal helpers.
- Delete old primary review preview rendering.
- Delete old MCP preview trust path.
- Delete stale docs language.
- Run full gate.

Out of scope:

- Do not delete released public APIs without migration plan.
- Do not delete developer diagnostics.
- Do not remove user data migrations.

Commands:

```bash
rg -n "deriveEntryNextAction|deriveTranslationSuggestedAction|PublishReadinessState|PreviewPanelState|checkpoint|confirmation token|cache tag" packages/cms/studio-app/src
rg -n "request\\.preview|args\\.preview|preview JSON|public provider.*readiness|defaultLocale = \\(\\) => 'en'" packages
pnpm run check
```

Completion criteria:

- Old duplicate paths are gone or intentionally documented.
- Full check passes.
- Developer diagnostics remain available.
````

## Reviewer Packet For High-Risk Packets 6-9 And 12

```txt
High-Risk Reviewer Packet

Review the current diff with extra skepticism.

Required reading:

- docs/concepts/studio/marketer-publishing-implementation-plan.md
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
- changed files
- relevant tests

Findings must answer:

- Is there more than one publish execution path?
- Is caller-provided preview JSON trusted anywhere?
- Can an agent bypass human-equivalent permissions?
- Can MCP write raw tables?
- Can public provider read draft/readiness state?
- Can subtree rebuild publish descendant drafts?
- Can route collisions mutate partially before failing?
- Are old and new paths left side by side?
- Are negative tests strong enough?
- Are focused commands enough?

Output:

- Findings first.
- Severity.
- File and line.
- Required fix.
- Whether the packet may proceed.
```

## Calibration Prompt

Use this before starting the real implementation program.

```txt
Calibration task:

Read:

- AGENTS.md
- docs/concepts/studio/marketer-publishing-implementation-plan.md
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md
- docs/concepts/studio/marketer-publishing-agent-experiments.md

Do not edit code.

Produce:

1. The first packet you would implement.
2. The exact files you would inspect first.
3. The first failing tests you would add.
4. The focused commands you would run.
5. The top five ways this packet could violate the architecture.

Do not propose implementation code yet.
```
