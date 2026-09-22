# Shared body editing

Work started 2026-09-22 from the accepted shared-editor candidate. The supplied
CMS checkout contains unrelated landing-page work and remains untouched.

The Editor runtime/session layer is implemented and locally verified in
`ginko-editor` through `e579d55`. Content `1.0.0-beta.9` is published and passes its
parser, policy, runtime, and packed-consumer checks. Editor itself is not yet
published. Local CMS checks use the inspected Editor archive and actual registry
Content bytes through `dev:editor-candidates`; this does not authorize release.

## Acceptance

- One room for an existing entry's localized rich-text body.
- Existing CMS identity, role checks, collection contract, lifecycle, body
  size, asset references, draft versions, and publication rules remain authority.
- Body operations update the trusted snapshot and canonical CMS draft in one
  transaction. Studio does not independently save the emitted source preview.
- Source replacement, imports, rollback, and other body writers fence an older
  session. Pending edits stay recoverable.
- Locale/document switching waits for accepted operations. Metadata edits stay
  protected by the existing optimistic version checks.
- Query subscriptions and writes use the existing replacement-safe host client;
  authentication changes retire the session.
- Existing local rich-text fields outside an entry retain their current behavior.
- Focused backend/runtime tests, real browser checks, and owning repository gates
  verify the resulting integration.

## Storage boundary

Keep room snapshots and bounded operation batches separate from locale draft
records. Bind each room to its entry, locale, policy revision, epoch, and last
canonical body hash. Read the current canonical body before accepting operations;
an external writer changing it makes the room stale. This covers existing
ingestion paths without putting invalidation logic in frontend bridges.

The room's accepted operations produce the next body. Apply it through the
existing canonical draft writer and asset-reference refresh. Published content
continues through the existing review/versioned publication operation. Preserve
the 64 KiB MDC body limit; Editor's larger general-purpose cap is not permission
to increase CMS limits.

## Verification

The full CMS check passed 1,319 tests (one pre-existing skip), including Studio
and backend types. Focused tests cover stale epochs, recreated locales, role
revocation, independent component properties, bounded history, scalar metadata
conflicts, publication flushes, and copied-tab recovery identities.

A private local Convex backend with ordinary signed identities installed the
real CMS component and a V2 Note policy. The normal bootstrap and invitation
APIs established an owner and editor. Two real `FieldRichtext` instances edited
Note title/tone, converged at canonical draft version 4, and retained both edits
on reload. A further title edit against the installed packed Convex component
converged at version 5. Each field emitted zero competing scalar form updates. The proof
used no production data or auth bypass and sent no invitation email.

The live check exposed the generic JSON validator's depth limit for V2 policies.
Contract input/storage now use a shallow envelope with full Content validation
inside install/check/transition handlers. Validated drift output also permits a
whole contract before the first installation. Public body parsing remains owned
by Content.

Both pnpm and strict npm packed-consumer builds passed. The backend also names
the matching Better Auth core version so npm cannot pair OAuth provider 1.7.2
with a newer incompatible core/fetch peer pair.

The dependency audit reports no known vulnerabilities after compatible SVGO,
devalue, and Vitest updates. The complete check also passed with this graph.

Editor 0.1.0 is still unpublished. `internals/migrations.md` tracks the temporary,
checksum-recorded workspace archive. Public manifests name its actual version.
Local candidate certification is separate from the required registry release
check. No deployment or package publication was performed.
