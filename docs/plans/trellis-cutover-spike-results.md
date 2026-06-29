# Trellis Cutover Phase 0 Spike Results

Date: 2026-06-29

Phase 0 result: complete. The spikes answered the architecture questions strongly enough to start Phase 1 hard cutover. The results do not require Trellis compatibility, a new bridge framework, or CMS semantics inside `better-convex-nuxt`.

Evidence repos:

- Ginko CMS: `/Users/matthias/Git/workspace/ginko-cms`
- better-convex-nuxt: `/Users/matthias/Git/convex/better-convex-nuxt`

## Spike 0A: Nuxt + Convex + Better Auth Foundation

Question:

Can a Nuxt app use `better-convex-nuxt` as the full foundation for client and server Convex access with Better Auth session sync?

Result: yes, with one non-blocking caveat.

Verified:

- `#convex/api` and `#convex/server` are registered by `src/module-aliases.ts`.
- `useConvexAuth` exposes token, user, authenticated, pending, error, sign-out, refresh, auth-ready, and Better Auth client access.
- `serverConvexQuery`, `serverConvexMutation`, and `serverConvexAction` exist and support `auth: "auto" | "required" | "none"` plus explicit `authToken`.
- Consumer fixture prepares and typechecks.
- Nuxt composable tests pass for auth/query/mutation/action.
- Server utility tests pass.

Commands:

```bash
cd /Users/matthias/Git/convex/better-convex-nuxt
pnpm check:consumer-smoke
pnpm vitest run --project=unit test/unit/server-convex-utils.test.ts test/unit/server-index-exports.test.ts test/unit/use-convex-user-types.test.ts test/unit/module-auto-imports.test.ts
pnpm vitest run --project=nuxt test/nuxt/useConvexAuth.nuxt.test.ts test/nuxt/useConvexMutation.nuxt.test.ts test/nuxt/useConvexQuery.nuxt.test.ts test/nuxt/useConvexAction.nuxt.test.ts
```

Observed results:

- `check:consumer-smoke`: passed.
- unit server/API-surface checks: 4 files passed, 13 tests passed.
- Nuxt auth/query/mutation/action checks: 4 files passed, 54 tests passed.

Caveat:

- A full browser signed-in server-route flow was not run in this spike. Existing server utility coverage proves token resolution and authenticated call behavior at the utility level. This is enough for Phase 1/2. Browser verification remains a later validation step.

Decision:

- Ginko should use `better-convex-nuxt` directly for Nuxt module setup, `#convex/api`, `#convex/server`, client composables, auth state, and server callers.
- Studio should use public `useConvexAuth`, not a private auth engine.
- No Trellis compatibility layer is needed.

Impact On Migration Plan:

- Phase 1 can replace `#trellis/api` with `#convex/api`.
- Phase 2 can target Nuxt prepare/type resolution with `better-convex-nuxt`.
- Phase 5 can use `useConvexAuth` as the Studio host auth boundary.

Required better-convex-nuxt Change:

- none blocking.

## Spike 0B: Better Auth Organization And Member Fit

Question:

Should Ginko use Better Auth Organization as canonical membership, or keep CMS-owned membership canonical?

Result: partial. Better Auth Organization is proven for generic organization/team/member workflows, but Ginko should not hard-replace CMS membership in the first Trellis cutover without a dedicated product-scope mapping.

Verified:

- `starters/team` uses Better Auth Organization as canonical auth-domain state.
- Better Auth owns organization, member, invitation, team, team-member, and role rows in that starter.
- Convex owns product project rows and product audit rows.
- Product authorization is enforced in Convex by asking Better Auth for permission/membership truth.
- App-owned org/member/invitation mirrors are intentionally absent in the team starter.

Commands:

```bash
cd /Users/matthias/Git/convex/better-convex-nuxt/starters/team
pnpm install --frozen-lockfile
pnpm exec nuxi prepare
pnpm test
```

Observed results:

- First `pnpm test` failed because `.nuxt/tsconfig.json` was missing.
- After `pnpm exec nuxi prepare`, `pnpm test` passed: 5 files passed, 30 tests passed.
- The missing-prepare friction is operational, not an architecture failure.

Decision:

- For the first Ginko Trellis hard cutover, keep Ginko CMS membership canonical unless Phase 4 proves CMS membership is only generic organization membership.
- Use Better Auth for users and sessions immediately.
- Use Better Auth Organization only if Ginko is ready to delete the CMS member source of truth and map project/site/collection role semantics cleanly.
- Do not mirror Better Auth organizations/members into Ginko as a second canonical member model.

Impact On Migration Plan:

- Phase 4 remains a real decision gate.
- Recommended default for migration agents: Decision B, keep Ginko `members` canonical during the Trellis removal, then consider a separate Better Auth Organization hard cutover.
- If Better Auth Organization is adopted, it must be a hard replacement, not a mirror.

Required better-convex-nuxt Change:

- none blocking.
- A Better Auth Organization recipe/starter is already present in `starters/team`.

## Spike 0C: Better Auth API Keys For MCP / Service Access

Question:

Can Better Auth API keys own MCP/service authentication while Ginko keeps product authorization?

Result: partial.

Verified:

- Existing `better-convex-nuxt` learnings document that `@better-auth/api-key@1.6.20` works with a local Better Auth Convex component.
- Existing learnings document that organization-owned and user-owned API keys can be created/listed/deleted through Better Auth HTTP routes.
- Existing learnings document that server-side Convex code can verify raw API keys through `auth.api.verifyApiKey()`.
- Existing learnings also document the important limitation: organization-scoped API keys can outlive deleted Better Auth organizations, so product routes must check organization existence separately.
- The MCP starter proves a separate Ginko-like service actor model with hashed bearer credentials, server-secret gating, organization scope derived from stored credential, destructive approvals, and product authorization in Convex.

Commands:

```bash
cd /Users/matthias/Git/convex/better-convex-nuxt/starters/mcp-agent
pnpm install --frozen-lockfile
pnpm test
```

Observed results:

- `pnpm test` passed: 9 files passed, 71 tests passed.
- The starter emitted expected local auth-site warnings because no Convex site URL was configured.

Decision:

- Do not use Better Auth API keys as the first Ginko MCP credential model unless the service identity is truly auth-domain only.
- For the Trellis cutover, MCP should remain transport only and call Ginko-owned product policy.
- A Ginko-owned service actor/credential model is safer for CMS-specific MCP approvals, scopes, audit identity, and destructive confirmation.
- Better Auth API keys remain a good future option for user/org-owned API credentials, but product routes must still re-check CMS organization/project/site existence and authorization.

Impact On Migration Plan:

- Phase 8 should follow the MCP starter boundary: bearer/service auth at transport, organization/product scope derived server-side, product writes through Convex policy, destructive approvals required.
- Do not add an MCP framework to `better-convex-nuxt`.
- Do not let API-key authentication become product authorization.

Required better-convex-nuxt Change:

- none blocking.
- Future docs could add a general API-key recipe, but Ginko does not need it before Phase 1.

## Spike 0D: Convex Component / Starter Shape

Question:

Can Ginko avoid a Trellis-style bridge framework by using direct templates or a simple component package shape?

Result: yes.

Verified:

- `starters/public` proves the smallest Nuxt + Convex + `better-convex-nuxt` starter shape without auth, bridge manifests, generated operation handles, or Trellis concepts.
- `starters/team` proves a richer Better Auth Organization app can stay starter-owned without a generic bridge framework.
- `starters/mcp-agent` proves MCP can live as userland/server code, not foundation runtime magic.

Commands:

```bash
cd /Users/matthias/Git/convex/better-convex-nuxt/starters/public
pnpm install --no-frozen-lockfile
pnpm exec nuxi prepare
pnpm test
pnpm typecheck
```

Observed results:

- Initial public starter install failed because `starters/public/pnpm-workspace.yaml` had an invalid `..` override and no lockfile.
- The invalid override was removed in `starters/public/pnpm-workspace.yaml`.
- The same invalid override was removed in `starters/agency/pnpm-workspace.yaml`.
- Public starter checks passed: Nuxt prepare, 1 test file passed, 3 tests passed, Nuxt typecheck passed.
- Agency starter was also checked after the same workspace fix: Nuxt prepare passed, 1 test file passed, 5 tests passed.

Decision:

- Ginko should prefer direct templates or Ginko-owned generated glue over a generic bridge package.
- No `@lupinum/trellis-bridge` replacement should be added to `better-convex-nuxt`.
- If Ginko needs generation, keep it CMS-owned and prove the concrete install requirement.

Impact On Migration Plan:

- Phase 7 should start with direct templates.
- Bridge-generation code should be deleted or simplified before any new generator is added.
- The starter fix in `better-convex-nuxt` should be kept.

Required better-convex-nuxt Change:

- completed small starter fix:
  - `/Users/matthias/Git/convex/better-convex-nuxt/starters/public/pnpm-workspace.yaml`
  - `/Users/matthias/Git/convex/better-convex-nuxt/starters/agency/pnpm-workspace.yaml`
- generated lockfiles now exist for public and agency starters after install:
  - `/Users/matthias/Git/convex/better-convex-nuxt/starters/public/pnpm-lock.yaml`
  - `/Users/matthias/Git/convex/better-convex-nuxt/starters/agency/pnpm-lock.yaml`

## Spike 0E: Ginko-Owned Operation Runtime Shape

Question:

Can Ginko replace Trellis operations with an explicit product operation registry without recreating a framework?

Result: yes.

Verified:

- A disposable in-memory operation runtime proved the shape:
  - explicit operation ids
  - explicit preview/execute map
  - destructive confirmation record
  - shared Studio/MCP caller path
  - audit write
  - no generated handles
  - no Trellis compatibility
- The MCP starter tests also prove the same product boundary at larger scale: destructive delete preview, approval request, approval read, approved execute, and denial when approval is missing/mismatched.

Command:

```bash
cd /Users/matthias/Git/workspace/ginko-cms
node --input-type=module <<'NODE'
// disposable operation registry proof; not committed
NODE
```

Observed result:

```txt
studio preview publish { preview: { entryId: 'entry-1', from: 'draft', to: 'published' } }
studio execute publish { ok: true, entryId: 'entry-1', status: 'published' }
mcp preview delete { preview: { entryId: 'entry-1', title: 'Draft', destructive: true }, confirmationId: 'confirm-1' }
mcp execute without confirmation rejected Confirmation required
mcp execute delete { ok: true, deleted: 'entry-1' }
audit [
  { actor: 'user:owner', operationId: 'entries.publish', entryId: 'entry-1' },
  { actor: 'service:mcp', operationId: 'entries.delete', entryId: 'entry-1' }
]
```

Decision:

- Use a Ginko-owned explicit operation registry for the migration.
- Start without codegen.
- Studio and MCP must call the same product operation policy.
- Destructive confirmation and audit belong in Ginko/Convex, not `better-convex-nuxt`.

Impact On Migration Plan:

- Phase 6 can proceed with explicit operation ids and preview/execute maps.
- Delete Trellis generated handles in Phase 1.
- Add codegen only later if the explicit registry becomes unmaintainable with concrete evidence.

Required better-convex-nuxt Change:

- none.

## Phase 0 Exit Criteria

- [x] `trellis-cutover-spike-results.md` exists.
- [x] Each spike has a yes/no/partial result.
- [x] Required `better-convex-nuxt` changes are implemented or explicitly deferred as non-blocking.
- [x] The membership source-of-truth decision is narrowed to a concrete Phase 4 default.
- [x] The component/bridge direction is chosen for Phase 7.
- [x] The operation runtime shape is clear enough for Phase 6.
- [x] No production Ginko migration code has been started.

