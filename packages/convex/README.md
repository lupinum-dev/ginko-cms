# @lupinum/ginko-cms-convex

Convex component package for Ginko CMS.

Convex is the hard v1 backend foundation for Ginko CMS. This package owns the
Convex-backed CMS implementation for content, assets, members, settings,
imports, projections, and operation surfaces used by Studio and MCP.

This package is installed by the Ginko CMS bridge workflow and exposes the
component config, auth, generated component API, and component bridge factory
from packed `dist` output.

## Compatibility

`@lupinum/ginko-cms-convex@0.1.1` is released with
`@lupinum/ginko-cms@0.1.1`, `@lupinum/ginko-cms-contract@0.1.1`,
`@lupinum/trellis@0.1.1`, and `@lupinum/trellis-bridge@0.1.1`.

Host apps mount this component through
`@lupinum/ginko-cms-convex/convex.config`; they should not import component
internals directly.
