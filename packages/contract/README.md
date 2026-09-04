# @lupinum/ginko-cms-contract

Framework-neutral contract package for Ginko CMS.

It contains shared CMS domain types, field metadata helpers, public-content
contracts, route diagnostics, dependency tags, permission types, and Convex
validators used by the CMS module and Convex component.

## Use It For

- Defining CMS-aware field metadata.
- Sharing public content shapes across package boundaries.
- Reusing content tag and route diagnostic helpers.
- Importing Convex validators inside the CMS Convex component.

## Public Subpaths

- `@lupinum/ginko-cms-contract/shared/fields`
- `@lupinum/ginko-cms-contract/shared/fields/conditions.js`
- `@lupinum/ginko-cms-contract/shared/fields/materialize.js`
- `@lupinum/ginko-cms-contract/shared/fields/normalize.js`
- `@lupinum/ginko-cms-contract/shared/fields/title.js`
- `@lupinum/ginko-cms-contract/shared/publicContent.js`
- `@lupinum/ginko-cms-contract/shared/contentTags.js`
- `@lupinum/ginko-cms-contract/shared/assetPolicy.js`
- `@lupinum/ginko-cms-contract/shared/types.js`
- `@lupinum/ginko-cms-contract/shared/order.js`
- `@lupinum/ginko-cms-contract/shared/permissions.js`
- `@lupinum/ginko-cms-contract/shared/placementGraph.js`
- `@lupinum/ginko-cms-contract/shared/readiness.js`
- `@lupinum/ginko-cms-contract/shared/caller.js`
- `@lupinum/ginko-cms-contract/shared/routeDiagnostics.js`
- `@lupinum/ginko-cms-contract/shared/utils.js`
- `@lupinum/ginko-cms-contract/convex/validators.js`
- `@lupinum/ginko-cms-contract/convex/caller.js`
- `@lupinum/ginko-cms-contract/convex/schemas/assets.js`
- `@lupinum/ginko-cms-contract/convex/schemas/collections.js`
- `@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js`
- `@lupinum/ginko-cms-contract/convex/schemas/editor.js`
- `@lupinum/ginko-cms-contract/convex/schemas/maintenance.js`
- `@lupinum/ginko-cms-contract/convex/schemas/members.js`
- `@lupinum/ginko-cms-contract/convex/schemas/portability.js`
- `@lupinum/ginko-cms-contract/convex/schemas/public.js`
- `@lupinum/ginko-cms-contract/convex/schemas/redirects.js`
- `@lupinum/ginko-cms-contract/convex/schemas/revalidation.js`
- `@lupinum/ginko-cms-contract/convex/schemas/siteData.js`

## Scope

This package must stay free of Nuxt, Vue, Studio UI, generated host setup files,
and CMS runtime implementation details. App teams normally install it
through `@lupinum/ginko-cms`; package and component code import it directly
only when they need the neutral contract surface.

## License

[MIT](./LICENSE)
