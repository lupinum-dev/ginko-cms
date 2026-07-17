# Operations And Maintenance

Use this reference for production rollout, recovery, destructive operations,
component diagnostics, and release-candidate work. Canonical docs:

- `docs/maintenance/backup-and-recovery.md`
- `docs/maintenance/convex-component-diagnostics-issue.md`
- `docs/maintenance/release-candidate.md`
- `docs/guides/migrations/recovery.md`
- `MAINTAINING.md`

## Recovery Boundaries

Database or deployment disaster recovery uses official Convex Backup & Restore,
including file storage when selected. Create and verify the Convex backup before
risky contract or deployment work.

Content portability is separate and owner-CLI only:

```bash
pnpm exec ginko-cms content export --out ./portable-content
pnpm exec ginko-cms content verify ./portable-content
```

Portability recovers bounded content as drafts under the installed contract. It
does not restore arbitrary tables, members, credentials, operational history,
or a deployment.

Permanent asset purge uses a third mechanism: a current verified artifact with
the complete bytes, manifest, byte length, and checksums. It restores that asset
byte-for-byte only.

## Destructive Operations

Preview destructive operations first. Permanent asset purge requires a current
verified asset recovery artifact. The expected shape is:

1. Create the recovery artifact for the exact asset.
2. Verify its bytes, manifest, length, checksums, freshness, and identity.
3. Preview the destructive operation.
4. Execute only after the preview confirms the artifact is current and the
   asset is unreferenced.

Do not write direct table edits as a workaround for product operation guards.

## Component Diagnostics Recovery

If component diagnostics fail after generated bridge drift:

1. Run `pnpm exec ginko-cms init` from the host root.
2. Run `pnpm exec ginko-cms doctor`.
3. Deploy generated Convex files with
   `pnpm exec convex dev --once --tail-logs disable --typecheck disable`.
4. Rerun the failing operation.

Bridge files should stay transport/setup glue. Keep CMS domain policy in the CMS
package or Convex component.

## Release Candidate Flow

Do not run live publish commands from an agent session. Direct publish is
disabled on purpose. Use:

```bash
pnpm run release:notes
pnpm run release:verify
pnpm run release:verify:registry
```

Then a human maintainer inspects `.pack/*.tgz` and follows `MAINTAINING.md`.
Do not commit `.pack/`, `dist/`, `.nuxt/`, `.output/`, or generated tarballs.

## Production Collection Changes

For production contract changes:

1. Create and verify an official Convex deployment backup.
2. Run `pnpm exec ginko-cms push --check`.
3. Install presentation-only or compatible changes directly when reported safe.
4. For incompatible content changes, explicitly unpublish affected live entries
   and use the bounded contract transition stage/status/apply/activate workflow.
5. Verify Studio, structural public routes, redirects, provider reads, and cache
   behavior.
