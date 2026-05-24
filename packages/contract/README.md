# @lupinum/ginko-cms-contract

Shared Ginko CMS domain types, public-content contracts, schema helpers, and
Convex validators.

This package is the neutral contract layer. It must not depend on Nuxt, Vue,
Studio UI, generated host bridge files, or CMS runtime implementation details.

Use `@lupinum/ginko-cms-contract/shared/*` for framework-neutral types and
helpers. Use `@lupinum/ginko-cms-contract/convex/*` only in Convex component
code.

## Compatibility

`@lupinum/ginko-cms-contract@0.1.0` is released with
`@lupinum/ginko-cms@0.1.0`, `@lupinum/ginko-cms-convex@0.1.0`, and
`@lupinum/ginko-content@0.1.0`.

This package is the contract boundary. It must stay free of Nuxt, Vue, Studio
UI, generated host bridge files, and CMS runtime implementation details.
