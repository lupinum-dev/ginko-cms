# Portable Directory Import

`@lupinum/ginko-cms/portability` imports a verified Ginko Content portable
directory into an existing CMS deployment. The resolved Content contract must
already be installed in the target deployment. Import never creates collection
definitions and never publishes content.

The caller must be an authenticated CMS owner using the user origin. MCP
credentials cannot use the bulk portability operations.

## Prepare And Apply

Create the portable directory with the Ginko Content Node portability API, then
pass its root directory to the CMS import commands:

```ts
import { ConvexHttpClient } from 'convex/browser'
import {
  applyPreparedPortableDraftImport,
  preparePortableDraftImport,
} from '@lupinum/ginko-cms/portability'

const client = new ConvexHttpClient(process.env.CONVEX_URL!)
client.setAuth(ownerToken)

const prepared = await preparePortableDraftImport(client, './portable-content', {
  deploymentId: 'production',
  targetContractSha256: installedContractSha256,
})

const receipt = await applyPreparedPortableDraftImport(client, prepared, {
  cmsOrigin: process.env.GINKO_CMS_ORIGIN!,
  sessionCookie: process.env.GINKO_CMS_SESSION_COOKIE!,
})
```

Preparation verifies the directory through Ginko Content, inspects the exact
current draft hashes, and seals an immutable server-side plan. Applying that
plan writes drafts in dependency order and records one idempotent receipt per
item. If the caller loses a successful response, it can apply the same prepared
plan again; committed items replay their receipts instead of writing twice.

Keep the returned prepared plan and its verified source directory for the
duration of the run. Changing the
deployment, contract hash, item payload, or expected draft hash invalidates the
operation instead of silently overwriting newer CMS work.

Local image blobs are streamed from the verified directory through the CMS
host. The host requires the same current owner session as the Convex planning
calls, never returns a Convex upload URL to the CLI, and re-verifies the stored
bytes before attaching the asset. Treat the session cookie as a secret; do not
write it into a plan or portable directory.

## Current Boundary

- Only Ginko Content portable directories are accepted. The removed generic
  Markdown/JSON/YAML scanner and caller-provided apply adapter are not retained.
- Imports create or update drafts. Publishing remains a separate normal CMS
  workflow.
- Local PNG, JPEG, GIF, and WebP blobs are hash-addressed, staged once, and
  structurally rewritten to managed CMS asset IDs. Changed or unsupported
  bytes block apply.
- External asset references must already be canonical HTTPS references in the
  portable document.
- Import planning and mutations are bounded to 250 items per request. The
  immutable plan binds the source manifest, source and target contracts,
  deployment, scope, item hashes, and expected current draft hashes.

## Related Pages

- [Changing collections](./changing-collections.md)
- [Migration recipes](./migrations/recipes.md)
- [Migration recovery](./migrations/recovery.md)
