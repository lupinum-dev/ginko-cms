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

import type { ComponentApi } from '@lupinum/ginko-cms-convex/component'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'

import type { api } from '#convex/api'
import type { StudioEntryKind, studioApiSurface } from '#ginko-cms-public/studio-api-surface.js'
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
        ? StudioEntryKind<Surface[Group][Name]> extends OpKindOf<ConvexGinkoCms[Group][Name]>
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
type GeneratedGinkoCms = ComponentApi

// The bridge exposes exactly the descriptor's groups — no more, no fewer.
type _BridgeGroupsMatchDescriptor = TypeAssert<TypeEqual<keyof BridgeGinkoCms, keyof Surface>>
type _ExactGetAccessContext = TypeAssert<
  TypeEqual<
    FunctionArgs<BridgeGinkoCms['members']['getAccessContext']>,
    Omit<FunctionArgs<GeneratedGinkoCms['members']['getAccessContext']>, '_trustedCaller'>
  >
>
type _ExactSaveEntryDraft = TypeAssert<
  TypeEqual<
    FunctionReturnType<BridgeGinkoCms['editor']['saveEntryDraft']>,
    FunctionReturnType<GeneratedGinkoCms['editor']['saveEntryDraft']>
  >
>
type _ExactInstalledContractStatusArgs = TypeAssert<
  TypeEqual<
    FunctionArgs<BridgeGinkoCms['contract']['getInstalledContractStatus']>,
    Omit<
      FunctionArgs<GeneratedGinkoCms['contract']['getInstalledContractStatus']>,
      '_trustedCaller'
    >
  >
>
type _ExactAssetUsagePage = TypeAssert<
  TypeEqual<
    FunctionReturnType<BridgeGinkoCms['assets']['listAssetUsages']>,
    FunctionReturnType<GeneratedGinkoCms['assets']['listAssetUsages']>
  >
>
type _ExactPublishImpactPageArgs = TypeAssert<
  TypeEqual<
    FunctionArgs<BridgeGinkoCms['editor']['listPublishRouteImpactPage']>,
    FunctionArgs<GeneratedGinkoCms['editor']['listPublishRouteImpactPage']>
  >
>

type RequiredConfirmationToken<Args> =
  Args extends Record<string, unknown>
    ? Omit<Args, '_confirmationToken' | '_expectedContentHash' | '_expectedPresentationHash'> & {
        _confirmationToken: string
      }
    : Args

type _PublishExecuteArgsStayAligned = TypeAssert<
  TypeEqual<
    FunctionArgs<BridgeGinkoCms['editor']['publishEntry']>,
    RequiredConfirmationToken<
      FunctionArgs<GeneratedGinkoCms['editor']['publishEntryOperationExecute']>
    >
  >
>

// The bridge type is, by construction, `StudioApiFromSurface<typeof
// studioApiSurface>` — so its per-function names and kinds cannot drift from the
// descriptor. The `@ts-expect-error` checks below prove the converse direction
// that matters operationally: functions that exist on `#convex/api` but are not
// in the descriptor are absent from the bridge.

// Concrete negative checks: real backend functions that exist on `#convex/api`
// but are deliberately excluded from the allowlist must NOT be reachable on the
// bridge type. If any of these becomes allowed, delete the matching line and add
// it to `studioApiSurface`.

// @ts-expect-error `assets.getAssetUrl` is not part of the Studio allowlist.
type _NoGetAssetUrl = BridgeGinkoCms['assets']['getAssetUrl']
// @ts-expect-error `agentRuns.startRun` is not part of the Studio allowlist.
type _NoStartRun = BridgeGinkoCms['agentRuns']['startRun']
// @ts-expect-error `public.routeMeta` is not part of the Studio allowlist.
type _NoRouteMeta = BridgeGinkoCms['public']['routeMeta']
// @ts-expect-error the `assetRecovery` group is not part of the Studio allowlist.
type _NoAssetRecoveryGroup = BridgeGinkoCms['assetRecovery']
// @ts-expect-error the `contractTransitions` group is not part of the Studio allowlist.
type _NoContractTransitionsGroup = BridgeGinkoCms['contractTransitions']

// Reference the assertions so they are not flagged as unused.
export type _StudioApiSurfaceTypeTest = [
  _EveryDescriptorEntryExistsWithDeclaredKind,
  _BridgeGroupsMatchDescriptor,
  _ExactGetAccessContext,
  _ExactSaveEntryDraft,
  _ExactInstalledContractStatusArgs,
  _ExactAssetUsagePage,
  _ExactPublishImpactPageArgs,
  _PublishExecuteArgsStayAligned,
  _NoGetAssetUrl,
  _NoStartRun,
  _NoRouteMeta,
  _NoAssetRecoveryGroup,
  _NoContractTransitionsGroup,
]
