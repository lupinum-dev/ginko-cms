// Consumer-build type test for the Studio API allowlist (vNext §10.7).
//
// Compiled by `pnpm --filter @lupinum/ginko-cms typecheck` via
// `tsconfig.runtime.json` (which includes `type-tests/**/*.ts` and extends the
// playground `.nuxt` config, so `#convex/api` resolves to the consumer's
// generated Convex API). It asserts two things:
//
//   1. Every `studioApiSurface` descriptor entry exists on the generated
//      `#convex/api` and has the declared operation kind. A missing function,
//      a group typo, or a query/mutation mismatch fails this file.
//   2. The constructed bridge type (`GinkoCmsStudioHostApi`) contains exactly
//      the descriptor entries — a backend function present on `#convex/api` but
//      absent from the descriptor must not appear on the bridge.

import type { api } from '#convex/api'
import type { studioApiSurface } from '#ginko-cms-public/studio-api-surface.js'
import type { GinkoCmsStudioHostApi } from '#ginko-cms-public/types.js'

type TypeAssert<Condition extends true> = Condition

type TypeEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false

/** Extract the `'query' | 'mutation' | 'action'` kind out of a FunctionReference. */
type OpKindOf<Ref> = Ref extends { _type: infer Kind } ? Kind : never

type Surface = typeof studioApiSurface
type ConvexGinkoCms = typeof api.ginkoCms

// ---------------------------------------------------------------------------
// (1) Every descriptor entry exists on `#convex/api` with the declared kind.
// ---------------------------------------------------------------------------

// For each descriptor leaf, resolve to `true` when the function exists on the
// generated api and its kind matches; otherwise resolve to a descriptive error
// tuple that will fail the assignability check below.
type SurfaceMatchesConvex = {
  [Group in keyof Surface]: {
    [Name in keyof Surface[Group]]: Group extends keyof ConvexGinkoCms
      ? Name extends keyof ConvexGinkoCms[Group]
        ? Surface[Group][Name] extends OpKindOf<ConvexGinkoCms[Group][Name]>
          ? true
          : [
              'KIND_MISMATCH',
              Group,
              Name,
              Surface[Group][Name],
              OpKindOf<ConvexGinkoCms[Group][Name]>,
            ]
        : ['MISSING_FUNCTION_ON_CONVEX_API', Group, Name]
      : ['MISSING_GROUP_ON_CONVEX_API', Group]
  }
}

type SurfaceAllTrue = {
  [Group in keyof Surface]: {
    [Name in keyof Surface[Group]]: true
  }
}

type _EveryDescriptorEntryExistsWithDeclaredKind = TypeAssert<
  SurfaceMatchesConvex extends SurfaceAllTrue ? true : false
>

// ---------------------------------------------------------------------------
// (2) The bridge type is exactly the descriptor — no un-listed function leaks.
// ---------------------------------------------------------------------------

type BridgeGinkoCms = GinkoCmsStudioHostApi['ginkoCms']

// The bridge exposes exactly the descriptor's groups — no more, no fewer.
type _BridgeGroupsMatchDescriptor = TypeAssert<TypeEqual<keyof BridgeGinkoCms, keyof Surface>>

// The bridge type is, by construction, `StudioApiFromSurface<typeof
// studioApiSurface>` — so its per-function names and kinds cannot drift from the
// descriptor. The `@ts-expect-error` checks below prove the converse direction
// that matters operationally: functions that exist on `#convex/api` but are not
// in the descriptor are absent from the bridge.

// Concrete negative checks: real backend functions that exist on `#convex/api`
// but are deliberately excluded from the allowlist must NOT be reachable on the
// bridge type. If any of these becomes allowed, delete the matching line and add
// it to `studioApiSurface`.

// @ts-expect-error `editor.mcpCreateEntry` is an MCP-only backend function, not part of the Studio allowlist.
type _NoMcpCreateEntry = BridgeGinkoCms['editor']['mcpCreateEntry']
// @ts-expect-error `editor.restoreEntry` is not part of the Studio allowlist.
type _NoRestoreEntry = BridgeGinkoCms['editor']['restoreEntry']
// @ts-expect-error `assets.getAssetUrl` is not part of the Studio allowlist.
type _NoGetAssetUrl = BridgeGinkoCms['assets']['getAssetUrl']
// @ts-expect-error `agentRuns.startRun` is not part of the Studio allowlist.
type _NoStartRun = BridgeGinkoCms['agentRuns']['startRun']
// @ts-expect-error `public.routeMeta` is not part of the Studio allowlist.
type _NoRouteMeta = BridgeGinkoCms['public']['routeMeta']
// @ts-expect-error the `backup` group is not part of the Studio allowlist.
type _NoBackupGroup = BridgeGinkoCms['backup']
// @ts-expect-error the `migrations` group is not part of the Studio allowlist.
type _NoMigrationsGroup = BridgeGinkoCms['migrations']

// Reference the assertions so they are not flagged as unused.
export type _StudioApiSurfaceTypeTest = [
  _EveryDescriptorEntryExistsWithDeclaredKind,
  _BridgeGroupsMatchDescriptor,
  _NoMcpCreateEntry,
  _NoRestoreEntry,
  _NoGetAssetUrl,
  _NoStartRun,
  _NoRouteMeta,
  _NoBackupGroup,
  _NoMigrationsGroup,
]
