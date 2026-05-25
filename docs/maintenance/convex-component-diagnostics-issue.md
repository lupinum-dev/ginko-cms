# Convex Component Discovery Diagnostics

This maintainer note records a Convex component discovery failure that affected
Ginko CMS package development. Use it when debugging component install shape,
dashboard module listing failures, or `convex dev` push failures after a bad
component mount.

## Summary

When developing a package that ships a Convex component, a bad component install
surface can make a deployment hard to recover. In our case the Convex dashboard
failed while loading `_system/frontend/modules:listForAllComponents`, and
`convex dev` could no longer start a push. The user-facing errors looked like a
Convex infrastructure issue, but the root cause was a package/component boundary
mistake in the app.

## What Happened

We were developing `@lupinum/ginko-cms`, which has:

- a Nuxt/runtime package,
- a separate Convex component package,
- generated host bridge files in the consumer app,
- Better Auth installed as a second Convex component.

The consumer app previously mounted components through facade exports from the
main package instead of the owning component packages. The generated
`convex/convex.config.ts` shape was effectively:

```ts
import betterAuth from '@lupinum/ginko-cms/convex/better-auth'
import ginkoCms from '@lupinum/ginko-cms/convex/config'
```

The safer/correct shape is:

```ts
import betterAuth from '@convex-dev/better-auth/convex.config'
import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import { defineApp } from 'convex/server'
```

After the bad install shape had reached a deployment, the dashboard could not
open the deployment data/modules page, and the CLI could not push a replacement.

## Errors

Dashboard:

```text
Error: [CONVEX Q(_system/frontend/modules:listForAllComponents)]
Server Error
Uncaught Error: JavaScript execution ran out of memory (maximum memory usage: 64 MB)
```

CLI:

```text
Error: Unable to start push to https://<deployment>.convex.cloud
Error fetching POST https://<deployment>.convex.cloud/api/deploy2/start_push
500 Internal Server Error: InternalServerError: Your request couldn't be completed. Try again later.
```

## Why This Was Hard To Debug

- The dashboard reported an internal system query OOM, not the component module
  path or package export that caused the oversized discovery surface.
- `start_push` returned a generic 500, so the CLI could not point at the bad
  `convex.config.ts` import.
- HTTP actions on the deployment still responded, which made the deployment look
  healthy from the outside.
- A fresh deployment with the corrected direct component imports worked.

## Reproduction Shape

1. Create a Convex app that installs multiple components.
2. Make one installed component's `convex.config` facade resolve through a broad
   package root or facade package export instead of a slim component directory.
3. Push the app.
4. Open dashboard data/modules or run `convex dev` again.
5. Observe dashboard module listing OOM and/or `deploy2/start_push` 500.

The exact package names above are ours, but the issue is generic: Convex
component discovery has very little diagnostic help when an installed component
surface resolves too broadly.

## Improvements That Would Help

1. Validate mounted component config imports before accepting a push.
   If a component config resolves to a package root or an unexpectedly large
   module tree, fail with the resolved path and module count.

2. Make `_system/frontend/modules:listForAllComponents` bounded and defensive.
   If module listing exceeds memory or count limits, return a structured error
   with the offending component name/path instead of OOMing.

3. Make `deploy2/start_push` return a component discovery/preflight error when
   the previous deployment's module metadata cannot be loaded.

4. Add documentation for package authors:
   component packages should ship a slim `dist/component` surface containing
   only `convex.config`, `schema`, `crons`, and actual Convex function entry
   modules. Host apps should install components from the owning package's
   `convex.config` export, not a facade in a larger runtime package.

5. If deploy-key admin auth supports acting identities, clarify the expected
   `ConvexHttpClient.setAdminAuth(token, actingAsIdentity)` behavior for deploy
   keys. We saw malformed auth headers with deploy keys and use
   `setAdminAuth(deployKey)` plus an explicit application-level caller in
   function args.

## Our Local Guardrails

We changed Ginko CMS to:

- generate direct component imports in consumer `convex/convex.config.ts`,
- require host apps to depend directly on `@convex-dev/better-auth`,
  `better-auth`, and `@lupinum/ginko-cms-convex`,
- fail `ginko-cms doctor` if facade component imports are present,
- keep `@lupinum/ginko-cms-convex/convex.config` pointed at a slim component
  package surface,
- use `CONVEX_DEPLOY_KEY` for contract sync through generated internal bridge
  functions, with no separate Ginko install secret.

## If This Happens

Use this recovery path when a deployment shows dashboard module-listing failures
or `deploy2/start_push` failures after a component import mistake:

1. Stop repeated pushes against the affected deployment.
2. Run `pnpm exec ginko-cms doctor` in the host app and inspect
   `convex/convex.config.ts`.
3. Replace facade imports with direct component imports:
   `@convex-dev/better-auth/convex.config` and
   `@lupinum/ginko-cms-convex/convex.config`.
4. If `convex dev` still cannot start a push, create a fresh Convex deployment
   for recovery instead of editing CMS tables directly.
5. Move or rotate the required environment values for the fresh deployment:
   `CONVEX_DEPLOY_KEY`, `CONVEX_IDENTITY_FORWARDING_KEY`, and
   `GINKO_FIRST_OWNER_EMAIL`.
6. Re-run `pnpm exec ginko-cms init`, `pnpm exec ginko-cms doctor`,
   `pnpm exec convex dev --once --tail-logs disable --typecheck disable`, and
   `pnpm exec ginko-cms push --check`.

## Related Pages

- [Release candidate checklist](./release-candidate.md)
- [Quickstart](../getting-started/quickstart.md)
