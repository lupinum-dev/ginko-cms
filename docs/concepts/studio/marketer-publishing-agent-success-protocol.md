# Marketer Publishing Agent Success Protocol

This document explains how to run the marketer publishing refactor with coding
agents while targeting roughly 95% implementation success.

The key point: the implementation plan is necessary, but not sufficient. A
large coding agent can still fail if it receives too much scope at once, writes
code before tests, or preserves duplicate paths. This protocol turns the
implementation plan into small task packets with strict gates, reviewer prompts,
and experiment loops.

Related documents:

- `docs/concepts/studio/marketer-publishing-pipeline.md`
- `docs/concepts/studio/marketer-publishing-implementation-plan.md`
- `docs/concepts/studio/marketer-publishing-agent-experiments.md`
- `docs/concepts/studio/marketer-publishing-agent-task-packets.md`

## Target Confidence Model

The target is not that one agent can implement everything in one run. That would
remain low confidence.

The target is:

```txt
one narrow task packet
+ failing invariant tests first
+ implementation
+ focused tests
+ reviewer agent
+ deletion check
+ full gate at phase boundary
= high-confidence merged slice
```

Approximate confidence targets:

| Work unit                                    | Expected success with this protocol |
| -------------------------------------------- | ----------------------------------: |
| Vocabulary and failing tests                 |                                 95% |
| Exact readiness detail, first vertical slice |                                 90% |
| Cheap workflow summary                       |                                 92% |
| Locale/provider foundation                   |                              88-92% |
| Review/publish/agent path                    |                              85-90% |
| Automatic subtree rebuild                    |                              80-88% |
| Studio migration                             |                                 90% |
| MCP hardening                                |                              88-92% |
| Cutover/deletion                             |                                 90% |
| Whole program with phase gates               |                              90-95% |

The route to 95% is not a smarter single prompt. It is smaller scopes, strong
tests, explicit reviewer roles, and no unreviewed phase jumps.

## Current Repo Research

These observations from the current repo shape the protocol.

### Test And Verification Surface

- [ ] Root `package.json` already has a broad `pnpm run check` gate that runs
      formatting, lint, typecheck, publish specifier checks, and tests.
- [ ] Root `package.json` has focused scripts for typecheck, release
      verification, package e2e, live-story smoke, and Studio workflow smoke.
- [ ] `vitest.config.ts` sets `fileParallelism: false`, so focused test commands
      are predictable but broad runs can take time.
- [ ] Relevant existing tests already exist under `test/component`,
      `test/runtime`, `test/refactor`, `test/module`, and `test/shared`.
- [ ] `test/component/entries/publish.test.ts` already covers direct publish,
      route-change revalidation, immutable public projection binding, and body
      source behavior.
- [ ] `test/component/entries/helpers.ts` already has `seedTreeFixture`, which
      can be extended for subtree rebuild fixtures.

### Current Implementation Pressure Points

- [ ] The current publish command upserts `publicEntries` and `publicRoutes` for
      the current entry/locales only. Automatic descendant route rebuild is not a
      small UI change.
- [ ] The schema already has an `entries.by_parent` index, so descendant traversal
      can be implemented without inventing a new table.
- [ ] Existing projection maintenance is entry-oriented, so subtree rebuild needs
      explicit traversal and tests.
- [ ] Current review request creation accepts preview-shaped input today, so the
      server-truth review packet must remove that trust path.
- [ ] Current Studio readiness behavior is split across page code, composables,
      and workflow helpers, so UI migration must be replacement work, not additive
      layering.
- [ ] Current provider/default-locale behavior needs a focused provider/i18n
      packet before readiness is treated as globally reliable.

### Process Consequences

- [ ] Backend readiness must land before broad Studio migration.
- [ ] Subtree rebuild must be split into preview and execute packets.
- [ ] Review/agent publish must be reviewed as operation-path work, not MCP work.
- [ ] Public provider changes need provider-contract tests, not only Studio tests.
- [ ] The final cutover must include search-based deletion checks.

## Why Agents Fail On This Refactor

### Failure Pattern 1: Scope Collapse

An agent sees the full implementation plan and tries to solve readiness, i18n,
publish, review, AI, subtree rebuild, Studio, and MCP in one pass.

Required mitigation:

- [ ] Give the agent one task packet only.
- [ ] Include explicit non-goals for that packet.
- [ ] Include exact tests to add or run.
- [ ] Ban opportunistic UI migration during backend foundation tasks.
- [ ] Ban opportunistic backend refactors during UI migration tasks.

### Failure Pattern 2: New Layer Instead Of Replacement

An agent adds `EntryReadinessDetail` while leaving existing publish impact,
frontend workflow helpers, review preview display, and list states as parallel
truth.

Required mitigation:

- [ ] Every task packet must list replacement targets.
- [ ] Every implementation task must include a deletion or migration check.
- [ ] Reviewer must search for old helper usage.
- [ ] Do not mark complete while old logic still decides publishability.

### Failure Pattern 3: Frontend Owns Backend Invariants

An agent makes Studio show nice states by combining query results locally.

Required mitigation:

- [ ] Backend exact readiness detail must exist before major UI migration.
- [ ] Studio may map codes to copy.
- [ ] Studio may manage unsaved local UI state.
- [ ] Studio may not decide if content can publish.
- [ ] Reviewer checks for publishability logic in Vue components.

### Failure Pattern 4: Public Provider Boundary Leak

An agent makes the public provider read readiness or draft tables because it is
convenient.

Required mitigation:

- [ ] Public provider must read active published projections only.
- [ ] Public provider tests must fail if draft-only content appears.
- [ ] Reviewer checks provider imports and Convex public read paths.

### Failure Pattern 5: Subtree Rebuild Publishes Drafts

An agent rebuilds descendants by reading their current drafts instead of their
active published revisions.

Required mitigation:

- [ ] Subtree rebuild tests must create dirty descendant drafts.
- [ ] After parent route publish, descendant content must remain the old
      published content.
- [ ] Descendant dirty locales must remain dirty.
- [ ] Rebuild code must explicitly load active published revision snapshots.

### Failure Pattern 6: Review And Agent Publish Drift

An agent adds separate logic for manual publish, review approval, and agent
publish.

Required mitigation:

- [ ] There must be one canonical publish execution path.
- [ ] Tests compare manual publish and agent publish output.
- [ ] Tests compare manual publish and review approval output.
- [ ] Reviewer rejects duplicated publish assertions.

### Failure Pattern 7: Tests Are Too Happy-Path

An agent adds tests that prove publish works but not that invalid states are hard
to represent.

Required mitigation:

- [ ] Every task packet must include at least one negative invariant test.
- [ ] Subtree tasks must include collision and no-descendant-draft-publish tests.
- [ ] Permission tasks must include unauthorized fail-closed tests.
- [ ] Provider tasks must include draft-leak tests.

## Agent Operating Rules

These rules should be included in every coding-agent task.

- [ ] Work from the current worktree.
- [ ] Read `AGENTS.md`.
- [ ] Read the implementation plan section for the assigned task.
- [ ] Read this success protocol section for the assigned task.
- [ ] Inspect existing code before editing.
- [ ] Add or update failing tests before implementation when behavior is new.
- [ ] Keep edits inside the assigned package boundary.
- [ ] Prefer delete, simplify, replace, add.
- [ ] Do not add stored workflow state.
- [ ] Do not add compatibility shims for unreleased internals.
- [ ] Do not widen public exports without explicit task permission.
- [ ] Do not migrate unrelated UI while implementing backend primitives.
- [ ] Do not alter generated files manually.
- [ ] Do not revert unrelated user changes.
- [ ] Run focused tests before handoff.
- [ ] Report tests that were not run.

## Required Agent Work Packet Format

Every coding task should use this shape.

````md
# Task Packet: <ID> <Title>

## Objective

Implement exactly this slice:

- <one concrete objective>

## Required Reading

- docs/concepts/studio/marketer-publishing-implementation-plan.md:<section>
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md:<section>
- <relevant source files>
- <relevant tests>

## In Scope

- <specific implementation item>
- <specific test item>
- <specific deletion/migration item>

## Out Of Scope

- <explicitly excluded adjacent work>
- <explicitly excluded UI/backend layer>

## Required Tests First

- <test file and invariant>
- <test file and invariant>

## Implementation Requirements

- <invariant>
- <invariant>
- <replacement/deletion rule>

## Commands

```bash
<focused test command>
<typecheck command if relevant>
```

## Completion Criteria

- [ ] Tests fail before implementation for the new behavior.
- [ ] Tests pass after implementation.
- [ ] No stored workflow state added.
- [ ] No duplicate source of truth added.
- [ ] Replacement map item updated.
- [ ] Focused tests reported.
````

## Reviewer Work Packet Format

Every implementation PR should be reviewed by a separate reviewer agent with a
review-only prompt.

```md
# Reviewer Packet: <ID> <Title>

Review the current diff as an architecture/invariant reviewer.

## Required Reading

- docs/concepts/studio/marketer-publishing-implementation-plan.md:<section>
- docs/concepts/studio/marketer-publishing-agent-success-protocol.md:<section>
- changed files
- relevant tests

## Review Stance

Find bugs, invariant gaps, duplicate sources of truth, missing tests, and old
paths left behind. Do not summarize first. Findings first.

## Must Check

- [ ] Does this add stored workflow state?
- [ ] Does this preserve an old parallel readiness path?
- [ ] Does this put backend invariants in frontend code?
- [ ] Does this widen public exports unnecessarily?
- [ ] Does this let MCP bypass operations?
- [ ] Does this let public provider read draft/readiness state?
- [ ] Are negative invariant tests present?
- [ ] Are focused commands enough for the touched behavior?

## Output

- Findings ordered by severity.
- File and line references.
- Missing tests.
- Whether the PR can proceed.
```

## Stop Conditions

A coding agent must stop and report instead of continuing when any of these are
true:

- [ ] It cannot identify the canonical source of truth for the concept it is changing.
- [ ] It needs to choose between two architecture options not decided in the docs.
- [ ] It would need to add a stored table not listed in the task.
- [ ] It would need to widen public package exports not listed in the task.
- [ ] It would need to edit generated files manually.
- [ ] It finds unrelated user changes in the same files that conflict with the task.
- [ ] Focused tests fail for reasons unrelated to the task and cannot be isolated.
- [ ] The implementation would require raw MCP table writes.
- [ ] The implementation would require public provider draft reads.
- [ ] The implementation would publish descendant drafts during subtree rebuild.

## Go Conditions

A coding agent may proceed without asking when all of these are true:

- [ ] The task packet identifies exact files or modules.
- [ ] Existing code has been inspected.
- [ ] The implementation follows an accepted invariant.
- [ ] The tests to add or run are clear.
- [ ] No public API widening is needed.
- [ ] No new stored table is needed.
- [ ] No generated file needs manual editing.
- [ ] The change deletes or replaces old paths where the task requires it.

## Phase Gates

### Gate 0: Before Coding Starts

- [ ] Product decisions are frozen in the pipeline document.
- [ ] Implementation plan exists.
- [ ] Success protocol exists.
- [ ] First task packet is narrow.
- [ ] Failing tests are identified.
- [ ] Reviewer packet is ready.

### Gate 1: Before Backend UI Migration

- [ ] Readiness vocabulary exists.
- [ ] Exact readiness detail exists.
- [ ] Every readiness state has tests.
- [ ] Required fields block publish.
- [ ] Missing locales appear in readiness.
- [ ] Public provider remains published-only.
- [ ] No major Studio migration has happened yet.

### Gate 2: Before Review/Agent Expansion

- [ ] Publish preview uses readiness-compatible blockers.
- [ ] Review request preview is computed in Convex.
- [ ] Review approval re-checks current preview.
- [ ] Manual publish path is canonical.
- [ ] Unauthorized agent publish fails closed.
- [ ] Authorized agent publish uses canonical path.

### Gate 3: Before Subtree Execute

- [ ] Subtree preview works.
- [ ] Subtree collision tests fail before implementation.
- [ ] Dirty descendant draft fixture exists.
- [ ] Provider route fixture exists.
- [ ] Revalidation expectation is defined.

### Gate 4: Before Studio Migration

- [ ] Exact readiness detail query exists.
- [ ] Cheap workflow summary exists.
- [ ] Review summaries exist.
- [ ] Publish preview includes affected URLs.
- [ ] Subtree affected URLs are represented.
- [ ] UI copy mapping is defined.

### Gate 5: Before Cutover

- [ ] All new paths are covered by tests.
- [ ] Old paths are identified.
- [ ] Replacement map is updated.
- [ ] Search commands for old helpers are listed.
- [ ] Full check has been run on latest code.

## Task Packet Sequence

### Packet 1: Vocabulary Types And Validators

Objective:

- Add readiness state, issue, and action vocabulary.

Required tests:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts
pnpm run typecheck
```

Do not:

- Implement readiness computation.
- Migrate Studio UI.
- Widen full detail shape as public API.

Reviewer emphasis:

- Public exports.
- No UI copy in contract.
- Unknown code validation.

### Packet 2: Exact Readiness Fixture Tests

Objective:

- Add failing tests for exact readiness detail states and blockers.

Required tests:

```bash
pnpm exec vitest run test/component/diagnostics.test.ts test/shared/studio-workflow.test.ts
```

Do not:

- Implement the engine in the same commit unless explicitly assigned.
- Change Studio UI.

Reviewer emphasis:

- Tests prove negative invariants.
- Tests cover data-only required-field blocking.
- Tests cover missing configured locales.

### Packet 3: Exact Readiness Engine

Objective:

- Implement `computeEntryReadinessDetail`.

Required tests:

```bash
pnpm exec vitest run test/component/diagnostics.test.ts test/shared/studio-workflow.test.ts
pnpm run typecheck
```

Do not:

- Add stored readiness rows.
- Call public provider.
- Migrate dashboard.

Reviewer emphasis:

- Source of truth.
- Per-locale correctness.
- Backend-owned invariants.

### Packet 4: Cheap Workflow Summary

Objective:

- Implement `computeEntryWorkflowSummary` for dashboard/list views.

Required tests:

```bash
pnpm exec vitest run test/component/entries/read.test.ts test/shared/studio-workflow.test.ts
```

Do not:

- Run full publish impact for every dashboard row.
- Invent different states.

Reviewer emphasis:

- Cheapness.
- Conservative uncertainty.
- Shared vocabulary.

### Packet 5: Locale And Provider Foundation

Objective:

- Remove hardcoded default locale and clarify locale source.

Required tests:

```bash
pnpm exec vitest run test/component/public-api.test.ts test/module/module-i18n.test.ts test/refactor/provider-contract.test.ts
```

Do not:

- Make public provider read readiness.
- Create public content for missing locales.

Reviewer emphasis:

- Provider boundary.
- Non-`en` default.
- Missing configured locales.

### Packet 6: Review Preview Server Truth

Objective:

- Make review request creation compute preview in Convex.

Required tests:

```bash
pnpm exec vitest run test/component/reviewRequests.test.ts test/runtime/mcp-request-publish-review.test.ts
```

Do not:

- Trust caller-provided preview JSON.
- Implement direct agent publish in the same packet.

Reviewer emphasis:

- Spoofed preview rejection.
- Stale review behavior.
- Stored review summary.

### Packet 7: Canonical Publish Path

Objective:

- Ensure manual publish, review approval, and authorized agent publish share one
  backend path.

Required tests:

```bash
pnpm exec vitest run test/component/reviewRequests.test.ts test/component/entries/publish.test.ts test/runtime/mcp-preview-publish.test.ts
```

Do not:

- Duplicate publish assertions in review approval.
- Bypass destructive confirmation semantics.

Reviewer emphasis:

- One execution path.
- Audit parity.
- Revalidation parity.

### Packet 8: Subtree Preview

Objective:

- Compute affected descendant public URLs and collisions before publish.

Required tests:

```bash
pnpm exec vitest run test/component/diagnostics.test.ts test/component/entries/publish.test.ts
```

Do not:

- Execute subtree rebuild yet unless assigned.
- Publish descendant drafts.

Reviewer emphasis:

- Deterministic traversal.
- Collision preflight.
- Same-locale behavior.

### Packet 9: Subtree Execute

Objective:

- Rebuild descendant projections/routes during parent route publish.

Required tests:

```bash
pnpm exec vitest run test/component/entries/publish.test.ts test/component/public-api.test.ts test/refactor/provider-contract.test.ts
```

Do not:

- Clear descendant dirty locales.
- Append descendant content revisions unless explicitly designed.
- Add automatic redirects.

Reviewer emphasis:

- Published revision source.
- Atomic collision behavior.
- Provider reads.
- Revalidation paths.

### Packet 10: Studio Entry Migration

Objective:

- Render backend readiness detail in entry editor.

Required tests:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts test/runtime/studio-workflow-components.test.ts
```

Do not:

- Decide publishability in Vue components.
- Remove developer diagnostics.

Reviewer emphasis:

- UI is rendering, not deciding.
- Copy mapping only.
- Old helper deletion.

### Packet 11: Dashboard And Review UI Migration

Objective:

- Use workflow summary and Convex review summaries in dashboard/reviews.

Required tests:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts test/component/reviewRequests.test.ts
```

Do not:

- Run exact preview for every dashboard row.
- Show raw preview JSON as primary UI.

Reviewer emphasis:

- Dashboard cheapness.
- Review clarity.
- Developer detail disclosure.

### Packet 12: MCP Hardening

Objective:

- Make MCP tools use safe operations for readiness, review, publish, archive,
  and restore.

Required tests:

```bash
pnpm exec vitest run test/runtime/mcp-request-publish-review.test.ts test/runtime/mcp-preview-publish.test.ts test/runtime/mcp-auth-middleware.test.ts test/runtime/mcp-response-redaction.test.ts
```

Do not:

- Write raw tables.
- Return secrets.

Reviewer emphasis:

- Auth.
- Scopes.
- Redaction.
- Operation path.

### Packet 13: Cutover And Deletion

Objective:

- Remove old duplicate paths after new paths are green.

Required commands:

```bash
rg -n "deriveEntryNextAction|deriveTranslationSuggestedAction|PublishReadinessState|PreviewPanelState|checkpoint|confirmation token|cache tag" packages/cms/studio-app/src
rg -n "request\\.preview|args\\.preview|preview JSON|public provider.*readiness|defaultLocale = \\(\\) => 'en'" packages
pnpm run check
```

Do not:

- Delete released public API without migration plan.
- Delete developer diagnostics.

Reviewer emphasis:

- Old path removal.
- Compatibility discipline.
- Full gate.

## Code Example: Readiness State Test Shape

This is an example of the style of test expected. It is not a committed API
promise until the relevant packet implements the exact function names.

```ts
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMultiLocaleSettings, seedOwner, seedTreeFixture } from './helpers'

const api = anyApi

describe('entry readiness detail', () => {
  it('shows configured missing locales without blocking the primary locale', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { rootAId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const readiness = await owner.query(api.editor.getEntryReadinessDetail, {
      entryId: rootAId,
    })

    expect(
      readiness.locales.find((item: { locale: string }) => item.locale === 'en'),
    ).toMatchObject({
      locale: 'en',
      draftExists: true,
    })
    expect(
      readiness.locales.find((item: { locale: string }) => item.locale === 'de'),
    ).toMatchObject({
      locale: 'de',
      state: 'missing',
      draftExists: false,
      canPublish: false,
    })
  })
})
```

## Code Example: Data-Only Required Field Test

```ts
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedOwner, seedSettings } from './helpers'

const api = anyApi

describe('data-only required field publish readiness', () => {
  it('allows saving an incomplete data-only draft but blocks publishing it', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const { entryId } = await seedDataOnlyRequiredFixture(ctx, {
      values: {},
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })

    expect(entry?.draftVersion).toBeGreaterThan(0)

    const preview = await owner.mutation(api.editor.previewPublishEntryOperation, {
      entryId,
      locales: ['en'],
      expectedVersion: entry?.draftVersion,
    })

    expect(preview.allowed).toBe(false)
    expect(preview.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: expect.stringMatching(/required/),
        }),
      ]),
    )
  })
})
```

## Code Example: Subtree Rebuild Test Shape

```ts
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  currentDraftVersion,
  publishEntry,
  seedOwner,
  seedSettings,
  seedTreeFixture,
} from './helpers'

const api = anyApi

describe('automatic subtree route rebuild', () => {
  it('moves published child routes when a parent route changes without publishing child drafts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childAId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, rootAId)
    await publishEntry(owner, childAId)

    const childBefore = await owner.query(api.public.getByPath, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/root-a/child-a',
    })
    expect(childBefore?.data?.title).toBe('Child A')

    await owner.saveEntryDraft({
      entryId: childAId,
      expectedDraftVersion: await currentDraftVersion(owner, childAId),
      patch: {
        locales: {
          en: {
            values: { title: 'Unpublished child draft' },
          },
        },
      },
    })

    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: await currentDraftVersion(owner, rootAId),
      patch: {
        shared: {
          slug: 'company',
        },
      },
    })

    const preview = await owner.mutation(api.editor.previewPublishEntryOperation, {
      entryId: rootAId,
      locales: ['en'],
      expectedVersion: await currentDraftVersion(owner, rootAId),
    })

    expect(preview.allowed).toBe(true)
    expect(preview.details.affectedPublicUrls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: childAId,
          kind: 'descendant',
          beforePath: '/docs/root-a/child-a',
          afterPath: '/docs/company/child-a',
        }),
      ]),
    )

    await publishEntry(owner, rootAId)

    const oldChild = await owner.query(api.public.getByPath, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/root-a/child-a',
    })
    expect(oldChild).toBeNull()

    const movedChild = await owner.query(api.public.getByPath, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/company/child-a',
    })
    expect(movedChild?.data?.title).toBe('Child A')
    expect(movedChild?.data?.title).not.toBe('Unpublished child draft')
  })
})
```

## Code Example: Agent Publish Parity Test Shape

```ts
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  publishEntry,
  seedAgentPublisher,
  seedEditorFixture,
  seedOwner,
  seedSettings,
} from './helpers'

const api = anyApi

describe('agent publish parity', () => {
  it('publishes through the same projection, audit, and revalidation semantics as a human publisher', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const agent = await seedAgentPublisher(ctx)

    const agentResult = await agent.mutation(api.editor.publishEntry, {
      entryId,
      locales: ['en'],
      expectedVersion: 1,
    })

    expect(agentResult.versionId).toBeTruthy()

    const publicRows = (await ctx.readAll('publicEntries')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(publicRows).toHaveLength(1)

    const auditRows = await ctx.readAll('destructiveAuditLog')
    expect(auditRows.length).toBeGreaterThan(0)

    const outboxRows = (await ctx.readAll('outboxEvents')).filter(
      (row: { type: string }) => row.type === 'content.revalidate',
    )
    expect(outboxRows.length).toBeGreaterThan(0)
  })

  it('does not let an edit-only agent publish directly', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const agent = await seedAgentEditorOnly(ctx)

    await expect(
      agent.mutation(api.editor.publishEntry, {
        entryId,
        locales: ['en'],
        expectedVersion: 1,
      }),
    ).rejects.toThrow(/permission|publish|scope/i)
  })
})
```

## Experiment Design

The experiment suite should measure whether agents can complete task packets
without violating architecture, not merely whether they produce passing tests.

### Experiment A: Prompt Scope

Question:

- Does a narrow packet outperform a full-plan prompt?

Run:

- [ ] Give Agent 1 the full implementation plan and ask for PR 1.
- [ ] Give Agent 2 only Packet 1 plus required reading.
- [ ] Compare diff size, test relevance, public export discipline, and old-path changes.

Expected result:

- Packet prompt should produce smaller, more correct changes.

### Experiment B: Tests-First Requirement

Question:

- Does requiring failing tests first reduce invariant misses?

Run:

- [ ] Agent A implements readiness detail directly.
- [ ] Agent B adds failing state tests first, then implements.
- [ ] Reviewer checks state coverage and negative tests.

Expected result:

- Tests-first agent should miss fewer edge cases.

### Experiment C: Reviewer Agent Value

Question:

- Does a separate reviewer catch defects the implementer misses?

Run:

- [ ] Implement Packet 6.
- [ ] Run no reviewer and record defects found by tests.
- [ ] Run reviewer packet and record additional findings.
- [ ] Compare escaped defects.

Expected result:

- Reviewer should catch duplicate publish path and preview trust issues.

### Experiment D: Subtree Rebuild Edge Cases

Question:

- Which prompt catches descendant draft publishing mistakes?

Run:

- [ ] Give one agent a generic subtree rebuild task.
- [ ] Give another agent Packet 8 and Packet 9 with explicit dirty descendant fixture.
- [ ] Compare whether tests preserve descendant published content.

Expected result:

- Explicit dirty descendant fixture should prevent the most dangerous bug.

### Experiment E: Public Provider Boundary

Question:

- Does the agent accidentally make provider read readiness?

Run:

- [ ] Ask agent to implement provider default locale fix.
- [ ] Reviewer checks imports and Convex public reads.
- [ ] Run provider tests.

Expected result:

- Correct implementation changes runtime locale config without draft/readiness reads.

## Experiment Scoring Rubric

Score each run from 0 to 3:

| Score | Meaning                                                  |
| ----- | -------------------------------------------------------- |
| 0     | Fails task or violates hard invariant.                   |
| 1     | Partially works but leaves duplicate path or weak tests. |
| 2     | Works with minor review feedback.                        |
| 3     | Works, deletes/replaces old path, tests prove invariant. |

Track these categories:

- [ ] Scope control.
- [ ] Test quality.
- [ ] Invariant preservation.
- [ ] Deletion discipline.
- [ ] Public API discipline.
- [ ] Provider boundary discipline.
- [ ] MCP operation discipline.
- [ ] Subtree correctness.
- [ ] Reviewability.

Target:

- [ ] Average score at least 2.6 before scaling to broad implementation.
- [ ] No score 0 on hard invariants.
- [ ] Subtree rebuild packets must score 3 before Studio migration starts.

## Success Rate Improvement Plan

### Step 1: Freeze Inputs

- [ ] Product direction document stable.
- [ ] Implementation plan stable.
- [ ] Success protocol stable.
- [ ] Experiment log created.
- [ ] First task packet selected.

### Step 2: Run Calibration

- [ ] Run Packet 1 with one implementer agent.
- [ ] Run reviewer agent.
- [ ] Score the output.
- [ ] Adjust packet wording if needed.
- [ ] Do not proceed to Packet 2 until score is at least 2.

### Step 3: Run Backend Foundation

- [ ] Packet 2 tests.
- [ ] Packet 3 exact readiness.
- [ ] Packet 4 summary.
- [ ] Packet 5 i18n/provider.
- [ ] Reviewer after each packet.
- [ ] Full gate after Packet 5.

### Step 4: Run Operation Foundation

- [ ] Packet 6 review preview.
- [ ] Packet 7 canonical publish and agent parity.
- [ ] Reviewer after each packet.
- [ ] Full gate after Packet 7.

### Step 5: Run Subtree Rebuild With Extra Review

- [ ] Packet 8 subtree preview.
- [ ] Reviewer focused on collision and draft preservation.
- [ ] Packet 9 subtree execute.
- [ ] Reviewer focused on provider output and revalidation.
- [ ] Full gate after Packet 9.
- [ ] Do not start Studio migration until subtree tests are green.

### Step 6: Run UI Migration

- [ ] Packet 10 entry editor.
- [ ] Packet 11 dashboard/reviews.
- [ ] Reviewer focused on frontend not owning invariants.
- [ ] Runtime/component tests.

### Step 7: Run MCP And Cutover

- [ ] Packet 12 MCP.
- [ ] Packet 13 cutover.
- [ ] Reviewer focused on raw writes, old paths, and public exports.
- [ ] Full check.

## Expected Human Review Points

Human input is not needed for every implementation detail. It is needed at
these points:

- [ ] Before public contract exports are widened.
- [ ] Before adding any new table.
- [ ] Before choosing asset metadata freshness model.
- [ ] Before deciding whether automatic redirects are added.
- [ ] Before changing released public APIs.
- [ ] Before changing permission role semantics.
- [ ] Before removing a documented user-facing behavior.

## What Makes 95% Realistic

The 95% target is realistic only if success means each packet is likely to
merge cleanly after review. It is not realistic for a single giant run.

The target becomes realistic because:

- [ ] Each packet has one objective.
- [ ] Each packet has explicit non-goals.
- [ ] Each packet starts with tests.
- [ ] Each packet has focused commands.
- [ ] Each packet has a reviewer prompt.
- [ ] Phase gates prevent UI work on weak backend assumptions.
- [ ] Subtree rebuild receives extra isolation and review.
- [ ] Cutover is its own task.

## Final Operating Rule

If a task packet cannot be reviewed in one sitting, the packet is too large.
