# Trellis Cutover Journal

## 2026-06-29

Objective: finish Phase 0 before the hard Trellis migration starts. Keep production Ginko code untouched. Learn through isolated evidence, then update the plan.

What worked:

- `better-convex-nuxt` already has the foundation surface Ginko needs: `#convex/api`, `#convex/server`, client composables, `useConvexAuth`, and server callers.
- Consumer-smoke passed. That gives confidence that Nuxt prepare/type resolution works for a consuming app.
- Server utility and Nuxt composable tests passed. The public API is already close to what Ginko Studio needs.
- The team starter is a strong proof for Better Auth Organization owning auth-domain org/member/team/invitation state while Convex owns product rows and audit.
- The MCP starter is a strong proof for keeping MCP as transport and enforcing product authorization/destructive approval in Convex.
- The public starter is enough proof that direct templates are viable for a small app. No bridge framework is needed for the foundation.
- The disposable operation runtime proof showed the simplest shape for replacing Trellis operation handles: explicit operation ids, preview, confirmation, execute, and audit.

What did not work immediately:

- Starter tests failed before dependencies were installed. The starters are standalone apps, so this is expected but easy to forget.
- `starters/team pnpm test` failed before `nuxi prepare` because `.nuxt/tsconfig.json` was missing. Running `pnpm exec nuxi prepare` first fixed it.
- `starters/public pnpm install --frozen-lockfile` failed because no lockfile existed.
- `starters/public pnpm install --no-frozen-lockfile` then exposed an invalid `..` override in `pnpm-workspace.yaml`.
- The same invalid override existed in `starters/agency/pnpm-workspace.yaml`.
- Several starter checks warn that `auth: true` has no usable `siteUrl`. That is expected in local non-dev-server checks, but it is a real DX warning Ginko agents should understand.

Friction:

- The foundation repo has several starters with slightly different setup expectations. Agents need to read each starter README before running commands.
- Missing `nuxi prepare` can look like product test failures because Vite reports `./.nuxt/tsconfig.json` as missing inside unrelated imports.
- Public/agency starter lockfile absence made the install less deterministic than team/MCP starters.
- Better Auth API keys are useful, but they are not enough as product authorization. Organization-scoped keys can outlive deleted organizations, so product routes must re-check product state.

Decisions captured:

- Phase 1 can start after this Phase 0. No more foundation research is needed before removing Trellis.
- Ginko should use `better-convex-nuxt` directly for integration plumbing.
- `better-convex-nuxt` should not grow CMS operation, bridge, MCP, or permission semantics.
- Default Phase 4 direction: keep Ginko `members` canonical during the Trellis hard cutover unless a dedicated mapping proves Better Auth Organization can fully replace it.
- Phase 7 direction: start with direct templates. Add Ginko-owned generation only if direct templates cannot satisfy installation.
- Phase 8 direction: MCP remains transport only. Product writes go through Ginko operation policy.
- Phase 6 direction: explicit Ginko operation registry, no generated handles in the first migration.

Changes made outside Ginko:

- Removed invalid `..` override from `/Users/matthias/Git/convex/better-convex-nuxt/starters/public/pnpm-workspace.yaml`.
- Removed invalid `..` override from `/Users/matthias/Git/convex/better-convex-nuxt/starters/agency/pnpm-workspace.yaml`.
- Generated starter lockfiles by installing public and agency starter dependencies.

Verification log:

```txt
better-convex-nuxt:
- pnpm check:consumer-smoke: passed
- unit server/API-surface focused tests: 4 files passed, 13 tests passed
- Nuxt auth/query/mutation/action focused tests: 4 files passed, 54 tests passed

starters/team:
- pnpm install --frozen-lockfile: passed
- initial pnpm test: failed because .nuxt/tsconfig.json was missing
- pnpm exec nuxi prepare && pnpm test: passed, 5 files passed, 30 tests passed

starters/mcp-agent:
- pnpm install --frozen-lockfile: passed
- pnpm test: passed, 9 files passed, 71 tests passed

starters/public:
- initial frozen install: failed because no lockfile existed
- install after workspace fix: passed
- pnpm exec nuxi prepare && pnpm test && pnpm typecheck: passed, 1 file passed, 3 tests passed

starters/agency:
- install after workspace fix: passed
- pnpm exec nuxi prepare && pnpm test: passed, 1 file passed, 5 tests passed

operation runtime proof:
- disposable Node script passed; destructive execute was rejected without confirmation and audit rows were written after execution
```

Open follow-ups for migration agents:

- Do not run Phase 1 until the current `better-convex-nuxt` starter fix is either accepted or intentionally reverted.
- If Ginko decides to use Better Auth Organization, make it a separate hard cutover and delete the old CMS membership source. Do not mirror both.
- Browser verification remains later-phase work. Phase 0 intentionally did not start long-running dev servers.


## 2026-06-29 - Phase 1 Hard Cutover

Objective: perform the hard migration pass, remove the old foundation from package metadata, source imports, generated operation files, bridge/MCP dependencies, tests, and docs. No tests or dev servers were run. One lockfile-only install was run to update dependency metadata after package changes.

What worked:

- Package metadata was the clean first cut. Root, CMS, and Convex package manifests no longer depend on the removed foundation packages.
- The Nuxt module now installs `better-convex-nuxt` instead of the old module dependency.
- Generated operation handles and refs were deleted.
- A small Ginko-owned operation skeleton now exists in `packages/convex/src/operations/`.
- A small Ginko-owned caller skeleton now exists in `packages/convex/src/callers/`.
- The Studio host now imports `#convex/api` and uses public `useConvexAuth` state instead of the private auth engine path.
- MCP and bridge surfaces were easier to disable cleanly than to preserve. This matches the hard-cutover rule: old path gone first, stabilization later.
- The main audit command now returns no old package/import/handle references outside migration docs.

What is intentionally broken or incomplete:

- Convex caller behavior is only a direct builder stub. Phase 3 must restore explicit public/member/admin helpers and product authorization.
- Component bridge runtime is disabled. Phase 7 must restore direct-template or Ginko-owned generated glue.
- Operation registry is empty. Phase 6 must restore operation descriptors, preview, confirmation, execute, and audit.
- MCP runtime/tools are disabled. Phase 8 must restore MCP as transport only.
- Package e2e and foundation verification scripts are disabled. Phase 9 must rebuild them for direct `better-convex-nuxt` consumption.
- Many tests that imported removed runtime concepts are skipped as Phase 1 placeholders. They must be restored slice by slice.
- Historical docs were collapsed or neutralized where they named removed packages. They need editorial cleanup later, but normal repo docs no longer carry stale foundation instructions.

Friction:

- The old foundation touched more than the obvious runtime files: eslint config, vitest config, package e2e, compatibility metadata, generated package exports, bridge manifests, tests, and old release notes.
- Replacing operation descriptor names mechanically exposed helper names such as `operationEffect` and `previewOf` that now live in a temporary Ginko operation runtime.
- The Studio host type still reflects the old auth bridge shape in public types. Phase 5 should align `GinkoCmsHostAuthEngine` with `useConvexAuth` instead of carrying shape drift.
- Lockfile update produced existing peer warnings around TypeScript 6 and module builder. That was not chased during Phase 1.

Verification log:

```txt
pnpm install --lockfile-only --ignore-scripts: passed with existing peer warnings
rg "@lupinum/trellis|@lupinum/trellis-bridge|@lupinum/trellis-eslint|#trellis|defineTrellis|defineCaller|defineOperation|operationPreview|operationPreviewValidator|defineMcpApp|OperationHandle|trellis operations generate|__trellis_auth_engine__" --glob '!node_modules' --glob '!dist' --glob '!packages/convex/src/_generated/**' --glob '!docs/plans/**': no matches
rg "Trellis|trellis" --glob '!node_modules' --glob '!dist' --glob '!packages/convex/src/_generated/**' --glob '!docs/plans/**' | rg -v "TODO\\(trellis-cutover\\)": no matches
package metadata scan for @lupinum/trellis, @lupinum/trellis-bridge, @lupinum/trellis-eslint: no matches
deleted generated-file check: operation handles/refs and old test stub are absent
```

Next best step:

- Start Phase 2 with Nuxt prepare/type-resolution repair. Keep disabled surfaces disabled until the slice that owns them.
