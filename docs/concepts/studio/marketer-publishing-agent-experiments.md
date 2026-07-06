# Marketer Publishing Agent Experiments

This document tracks experiments that improve coding-agent success rate for the
marketer publishing refactor.

Related documents:

- `docs/concepts/studio/marketer-publishing-pipeline.md`
- `docs/concepts/studio/marketer-publishing-implementation-plan.md`
- `docs/concepts/studio/marketer-publishing-agent-success-protocol.md`
- `docs/concepts/studio/marketer-publishing-agent-task-packets.md`

## Experiment Rules

- [ ] Run experiments on narrow task packets.
- [ ] Record the exact prompt used.
- [ ] Record the model/settings used.
- [ ] Record changed files.
- [ ] Record focused test commands.
- [ ] Record typecheck/check commands when run.
- [ ] Score the output with the rubric below.
- [ ] Keep failed experiments.
- [ ] Use failed experiments to improve task packets.
- [ ] Do not treat a passing test run as proof of architectural correctness.
- [ ] Do not proceed from subtree preview to subtree execute until experiment score is acceptable.

## Scoring Rubric

| Score | Meaning                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| 0     | Fails task or violates a hard invariant.                                      |
| 1     | Partially works but leaves duplicate truth, weak tests, or broad scope drift. |
| 2     | Works with minor review feedback.                                             |
| 3     | Works, deletes/replaces old path, and tests prove the invariant.              |

Score categories:

- [ ] Scope control.
- [ ] Test quality.
- [ ] Invariant preservation.
- [ ] Source-of-truth discipline.
- [ ] Public API discipline.
- [ ] Public provider boundary.
- [ ] MCP operation discipline.
- [ ] Subtree correctness.
- [ ] Deletion discipline.
- [ ] Reviewability.

## Success Thresholds

- [ ] Calibration tasks must average at least 2.4 before broad implementation.
- [ ] Backend foundation tasks must average at least 2.6 before UI migration.
- [ ] Subtree rebuild tasks must score 3 before Studio migration.
- [ ] No hard-invariant category may score 0.
- [ ] Any score 0 requires packet rewrite before retry.
- [ ] Two repeated score 1 results require splitting the packet.

## Experiment Register

### EXP-001: Full Plan Prompt Versus Narrow Packet Prompt

Status:

- [ ] Not run
- [ ] Running
- [ ] Complete

Question:

- Does a narrow task packet produce safer output than giving the whole plan?

Setup:

- Agent A receives the full implementation plan and is asked to do PR 1.
- Agent B receives only Packet 1, required reading, and success protocol rules.

Required commands:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts
pnpm run typecheck
```

Evidence to collect:

- [ ] Agent A diff size.
- [ ] Agent B diff size.
- [ ] Agent A touched files.
- [ ] Agent B touched files.
- [ ] Agent A test quality.
- [ ] Agent B test quality.
- [ ] Agent A public export changes.
- [ ] Agent B public export changes.
- [ ] Reviewer findings for Agent A.
- [ ] Reviewer findings for Agent B.

Expected result:

- Narrow packet prompt should have smaller diff, fewer architectural mistakes,
  and better test focus.

Result:

- Score:
- Notes:

### EXP-002: Tests-First Versus Implementation-First

Status:

- [ ] Not run
- [ ] Running
- [ ] Complete

Question:

- Does requiring failing tests first improve invariant coverage?

Setup:

- Agent A implements exact readiness detail directly.
- Agent B writes failing exact readiness tests first, then implements.

Required commands:

```bash
pnpm exec vitest run test/component/diagnostics.test.ts test/shared/studio-workflow.test.ts
pnpm run typecheck
```

Evidence to collect:

- [ ] Number of negative tests.
- [ ] Coverage of all readiness states.
- [ ] Coverage of required field blockers.
- [ ] Coverage of missing configured locales.
- [ ] Whether implementation introduced stored workflow state.
- [ ] Whether Vue gained backend invariants.

Expected result:

- Tests-first prompt should reduce missed edge cases.

Result:

- Score:
- Notes:

### EXP-003: Reviewer Agent Value

Status:

- [ ] Not run
- [ ] Running
- [ ] Complete

Question:

- Does a separate reviewer catch architecture defects after focused tests pass?

Setup:

- Implement Packet 6: review preview server truth.
- Run focused tests.
- Run reviewer packet.

Required commands:

```bash
pnpm exec vitest run test/component/reviewRequests.test.ts test/runtime/mcp-request-publish-review.test.ts
```

Evidence to collect:

- [ ] Tests passed before review.
- [ ] Reviewer findings.
- [ ] Findings that tests did not catch.
- [ ] Whether caller-provided preview JSON remained trusted.
- [ ] Whether stale approval behavior was covered.

Expected result:

- Reviewer should catch source-of-truth and stale-preview issues.

Result:

- Score:
- Notes:

### EXP-004: Subtree Dirty Descendant Fixture

Status:

- [ ] Not run
- [ ] Running
- [ ] Complete

Question:

- Does an explicit dirty descendant fixture prevent accidental descendant draft publish?

Setup:

- Agent A gets generic subtree rebuild instruction.
- Agent B gets Packet 8 and Packet 9 with the dirty descendant fixture requirement.

Required commands:

```bash
pnpm exec vitest run test/component/entries/publish.test.ts test/component/public-api.test.ts test/refactor/provider-contract.test.ts
```

Evidence to collect:

- [ ] Whether preview lists descendant URLs.
- [ ] Whether execute rebuilds child route.
- [ ] Whether execute rebuilds grandchild route.
- [ ] Whether descendant draft remains unpublished.
- [ ] Whether descendant dirty locale remains dirty.
- [ ] Whether provider resolves new route.
- [ ] Whether old route no longer resolves.
- [ ] Whether revalidation includes old and new URLs.

Expected result:

- Explicit dirty descendant fixture should prevent the most dangerous subtree bug.

Result:

- Score:
- Notes:

### EXP-005: Public Provider Boundary Prompt

Status:

- [ ] Not run
- [ ] Running
- [ ] Complete

Question:

- Does the task packet keep public provider published-only while removing hardcoded locale behavior?

Setup:

- Agent implements Packet 5.
- Reviewer checks provider imports, public functions, and tests.

Required commands:

```bash
pnpm exec vitest run test/component/public-api.test.ts test/module/module-i18n.test.ts test/refactor/provider-contract.test.ts
```

Evidence to collect:

- [ ] Hardcoded default locale removed.
- [ ] Provider reads active projections only.
- [ ] Missing configured locale does not appear as public content.
- [ ] Non-`en` default locale test passes.
- [ ] No readiness detail read from provider.

Expected result:

- Provider boundary remains clean.

Result:

- Score:
- Notes:

### EXP-006: Agent Publish Permission Prompt

Status:

- [ ] Not run
- [ ] Running
- [ ] Complete

Question:

- Does actor parity survive implementation of direct AI publishing?

Setup:

- Agent implements authorized and unauthorized agent publish behavior.
- Reviewer compares human and agent publish outputs.

Required commands:

```bash
pnpm exec vitest run test/component/reviewRequests.test.ts test/component/entries/publish.test.ts test/runtime/mcp-preview-publish.test.ts
```

Evidence to collect:

- [ ] Authorized agent publish succeeds.
- [ ] Unauthorized agent publish fails closed or requests review by contract.
- [ ] Agent publish uses same projection path.
- [ ] Agent publish uses same audit path.
- [ ] Agent publish uses same revalidation path.
- [ ] No MCP raw table writes.

Expected result:

- Agent publish has parity with human publish and remains guarded.

Result:

- Score:
- Notes:

## Experiment Run Template

````md
## Run: <date> <experiment id> <agent/model>

Prompt:

```txt
<exact prompt>
```

Changed files:

- `<file>`

Commands run:

```bash
<command>
```

Results:

- Tests:
- Typecheck:
- Lint:
- Manual review:

Scores:

- Scope control:
- Test quality:
- Invariant preservation:
- Source-of-truth discipline:
- Public API discipline:
- Public provider boundary:
- MCP operation discipline:
- Subtree correctness:
- Deletion discipline:
- Reviewability:

Decision:

- [ ] Accept packet.
- [ ] Request targeted fix.
- [ ] Split packet.
- [ ] Rewrite prompt.
- [ ] Reject approach.

Notes:

- <notes>
````

## Current Calibration Status

- [ ] EXP-001 complete.
- [ ] EXP-002 complete.
- [ ] EXP-003 complete.
- [ ] EXP-004 complete before subtree execute.
- [ ] EXP-005 complete before provider changes merge.
- [ ] EXP-006 complete before agent publish merges.
- [ ] Average score calculated.
- [ ] Packet prompts updated from findings.

## Decision Log

### Decision 001: Do Not Run Full Plan As One Agent Task

Status:

- [x] Accepted

Reason:

- Scope is too broad and cross-cutting. One giant run has high risk of duplicate
  paths, weak tests, and hidden source-of-truth drift.

Consequence:

- Work is split into task packets and reviewed separately.

### Decision 002: Subtree Rebuild Requires Extra Calibration

Status:

- [x] Accepted

Reason:

- Automatic subtree rebuild is the highest-risk backend feature. It can pass
  simple route tests while publishing descendant drafts or missing revalidation.

Consequence:

- Subtree preview and execute are separate packets.
- Dirty descendant fixture is mandatory.
- Subtree execute must score 3 before Studio migration starts.

### Decision 003: Reviewer Agent Is Required For Operation And Subtree Packets

Status:

- [x] Accepted

Reason:

- Publish/review/agent/subtree changes affect core invariants and can fail in
  ways that focused tests miss.

Consequence:

- Packets 6, 7, 8, 9, and 12 require reviewer-agent pass before merge.
