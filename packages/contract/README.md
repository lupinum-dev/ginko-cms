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
- `@lupinum/ginko-cms-contract/shared/publicContent.js`
- `@lupinum/ginko-cms-contract/shared/contentTags.js`
- `@lupinum/ginko-cms-contract/shared/assetPolicy.js`
- `@lupinum/ginko-cms-contract/shared/types.js`
- `@lupinum/ginko-cms-contract/shared/order.js`
- `@lupinum/ginko-cms-contract/shared/permissions.js`
- `@lupinum/ginko-cms-contract/shared/caller.js`
- `@lupinum/ginko-cms-contract/shared/routeDiagnostics.js`
- `@lupinum/ginko-cms-contract/shared/utils.js`
- `@lupinum/ginko-cms-contract/convex/validators.js`
- `@lupinum/ginko-cms-contract/convex/caller.js`
- `@lupinum/ginko-cms-contract/convex/schemas/*.js`

## Scope

This package must stay free of Nuxt, Vue, Studio UI, generated host setup files,
and CMS runtime implementation details. App teams normally install it
through `@lupinum/ginko-cms`; package and component code import it directly
only when they need the neutral contract surface.

## License

[MIT](./LICENSE)
