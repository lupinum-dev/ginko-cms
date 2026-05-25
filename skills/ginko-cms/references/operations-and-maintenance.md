# Operations And Maintenance

Use this reference for production rollout, backups, destructive operations,
component diagnostics, and release-candidate work. Canonical docs:

- `docs/maintenance/backup-and-recovery.md`
- `docs/maintenance/convex-component-diagnostics-issue.md`
- `docs/maintenance/release-candidate.md`
- `docs/guides/migrations/recovery.md`
- `MAINTAINING.md`

## Backup Reality

The CLI exposes:

```bash
pnpm exec ginko-cms backup export --scope full --out ./ginko-backup.json
pnpm exec ginko-cms backup verify --artifact-id <id>
pnpm exec ginko-cms backup download --artifact-id <id> --out ./ginko-backup.json
```

Supported scopes: `full`, `collection`, `entry`, and `asset`.

Important limits:

- Backup actions require CMS owner identity.
- The current backup CLI path is not the deploy-key internal bridge.
- There is no backup import or restore command.
- Treat backups as recovery sources for operator-led repair, not automatic
  rollback state.

`backup verify` reports:

- `checksumMatches`: artifact integrity.
- `currentDataMatches`: whether live data still matches the backup scope.

## Destructive Operations

Preview destructive operations first. Some destructive actions require a valid
backup artifact. The expected shape is:

1. Export a backup for the affected scope.
2. Verify the artifact.
3. Preview the destructive operation.
4. Execute only after the preview confirms the backup is valid for current data.

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

1. Preserve a verified backup through an owner-authenticated operator workflow.
2. Run `pnpm exec ginko-cms push --check`.
3. Apply content migrations only when needed.
4. Push only after drift is safe.
5. Verify Studio, public routes, provider reads, and cache behavior.
