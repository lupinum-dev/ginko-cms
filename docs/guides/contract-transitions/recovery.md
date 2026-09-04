# Contract Transition Recovery

Before a shared-environment transition, create and verify an official Convex
deployment snapshot. Content portability exports recover bounded content as
drafts; they are not database disaster-recovery artifacts.

## Staging Failure

Staging is version- and hash-fenced. If a draft changes, an output is invalid,
or the staged graph contains a route collision or cycle, the page fails without
advancing its durable cursor.

Fix the transform or conflicting draft, then resume the same transition file.
If apply has not started and the rollout should stop, cancel the printed run ID:

```bash
pnpm exec ginko-cms contract transition cancel <run-id> --yes
```

Cancellation removes the Studio write lock but does not mutate draft content.

## Apply Failure

Apply commits one bounded page at a time. Each item retains its input version,
input hash, output hash, and applied state. Inspect the run:

```bash
pnpm exec ginko-cms contract transition status <run-id>
```

After apply begins, cancellation is forbidden because earlier pages may already
be canonical draft state. Correct the cause and resume:

```bash
pnpm exec ginko-cms contract transition apply <run-id> --yes
pnpm exec ginko-cms contract transition activate <run-id> --yes
```

Activation remains atomic and refuses to run while any staged item is pending,
the contract lock was lost, an affected entry was republished, or canonical
input changed.

## Disaster Recovery

If forward recovery is unsafe:

1. Stop writes to the affected deployment.
2. Preserve the run ID, status, logs, and proof artifacts.
3. Restore the verified Convex snapshot into an isolated deployment.
4. Compare the restored state with every already-applied transition item.
5. Validate the corrected transition on a disposable deployment before retry.

Do not edit CMS tables directly and do not introduce old/new dual reads. Asset
recovery artifacts protect bytes before permanent asset purge; they do not
restore content or database rows.

After recovery or activation, run `ginko-cms push --check`, `ginko-cms doctor`,
the host typecheck/build, and verify all affected public routes and locales.
