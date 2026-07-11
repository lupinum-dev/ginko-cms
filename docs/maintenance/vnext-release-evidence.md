# V-next Release Evidence

Date: 2026-07-11

## Candidate Tuple

- Ginko Content `0.3.0`: `dae9dde8898db1d162bb34d2eb2dc809d9f0aa01514c372911744863e602b54f`
- Better Convex Nuxt `0.6.0`: `6ac9209cde5f7a4ea36c041951bd98d07e2495340cbbaeccc4b6aa2beab657c4`
- Ginko CMS Contract `0.1.1`: `c9f983fc1382a808e203353f4edfee4abfa6e4af20ce5e808d141e72a21f6510`
- Ginko CMS Convex `0.1.2`: `801d1cbb4e6b89adc68afe58c220a5492c1bebf6a3261e2c1df358c98995a8da`
- Ginko CMS `0.1.3`: `5ca6d61d9995a9386a178cda9901e0357cfa673cd67a03f70caec7d3702fd00e`

The dependency artifacts were installed by exact file and SHA-256. The consumer
lockfile contained no `workspace:` or `link:` resolution.

## Deterministic Evidence

- `pnpm run check`: passed; 107 test files and 847 tests passed, with one
  explicitly skipped test.
- `pnpm run audit:prod`: passed with no known vulnerabilities.
- Two serial candidate package runs produced identical evidence manifests and
  byte-identical Contract, Convex, and CMS tarballs.
- The final in-app-browser pass reverified signed-out route protection, a real
  credentialed Studio session, all eight collection contracts, public Content
  rendering, the MCP settings surface, unauthenticated MCP rejection, clean
  warmed-page consoles, and sign-out against the exact local tarball tuple.
- The packed consumer passed initialization, doctor, offline Convex codegen,
  Nuxt preparation/typechecking, and public package import probes with its
  public-content API and MCP routes explicitly enabled.
- A live candidate run successfully deployed the packed Convex functions.
- A production Nuxt build from the packed consumer completed and contained the
  Studio host plus sign-in/register chunks.
- The final local playground returned unauthenticated HTTP 200 responses for
  public list, navigation, search, and sitemap endpoints; list and navigation
  returned published records.
- The Studio pagination regression test proves that a live first-page insertion
  rebuilds already-loaded pages from the new cursor without losing a displaced
  row. It also proves that only one live subscription exists and that disposal
  unsubscribes exactly once.

## Browser Certification

The exact packed production candidate passed all 35 live-story scenarios. The
run covered signed-out route protection, invalid and valid sign-in, every Studio
deep link, isolated draft creation and publishing, list filtering, upload and
retirement, unauthenticated public list/navigation/search/sitemap reads, invalid
public input, MCP authentication failures, MCP key creation, one-time secret
display, 22 authenticated MCP tools, key revocation, fixture cleanup, sign-out,
and protected-route denial after sign-out.

The in-app browser independently verified the authenticated Studio shell and
settings UI, with no warning or error console entries. A draft created in a
separate browser appeared in the already-open content list without a reload,
proving the live subscription path. Restoring the original membership mapping
immediately replaced that list with the signed-in-but-not-a-member boundary;
no outgoing-identity content remained visible and no console error appeared.
All temporary entries, assets, MCP keys, membership changes, owner-email changes,
and origin changes were cleaned up or restored after certification.

The CMS artifact was then recertified through the real packed consumer. The
consumer used exact `file:` tarballs for the complete
tuple, with workspace overrides preventing nested registry copies. Its Convex
deployment, eight collection contracts, lint, typecheck, 230-route production
prerender, CMS doctor, MCP doctor, and browser smoke all passed.

The in-app browser verified EN/DE public pages, provider search, signed-out
Studio protection, sign-in, Studio live reads, draft creation, preview,
publishing, the resulting public page and navigation update, unpublishing,
archival cleanup, MCP connection creation and revocation, and sign-out. The
captured browser console contained no warnings or errors. The temporary entry
and MCP connection were removed before closeout.

Direct A-to-B replacement was verified in the in-app browser with a disposable
second identity and a consumer-only probe built against the exact packed
candidate. On one mounted page, identity A started authenticated and settled;
the integrated `signIn.email` operation then replaced it with identity B without
a reload. The reactive user changed to B, status returned to `authenticated`,
pending returned to `false`, B entered Studio as the expected owner, and the
console remained free of warnings and errors. Afterward, all 11 Better Auth
tables (including row IDs), CMS members, and deployment environment values were
restored byte-for-byte to their pre-test state.

The same consumer-only browser probe invoked a real Convex mutation and action
through the packed candidate and intentionally forced both calls to fail. The
public error view used the locally captured operation, reported `mutation` and
`action` respectively, and serialized the normalized errors without `cause`.
Neither failure produced an uncaught rejection, warning, or error in the browser
console.

## Commits

- `72a022b7` collision-safe search auto-import and certified Ginko Content toolchain
- `6dcc8cd2` request-safe Better Convex Nuxt server configuration bridge
- `1a5b4b2f` callable collection-contract component boundary
- `32324537` mounted provider routes and lossless runtime collection merging
- `a6ee213` real consumer V-next API and exact-artifact migration
- `75dad67` real consumer Convex adapter refresh
- `48d197db` secure opaque-error boundaries
- `52e17419` exact dependency artifact verification
- `2614a41b` reproducible Content vendor verification
- `c4ef6760` V-next release documentation
- `7d305d42` coordinated candidate certification and provider validation
- `177d9fc1` build-time Studio routing and locale-less SSR fix
- `80233596` callable Better Auth API-key client support
- `08c446af` stable sign-in/sign-up hydration
- `02ae37fc` live-update-safe Studio pagination
- `a735cc72` hardened packed and live release harnesses
- `edaf8dc1` maintained Lucide Studio icon boundary
- `ea29f674` coordinated V-next toolchain and artifact tuple
- `03ee7f6d` duplicate candidate resolution rejection
- `70a33032` pinned Ginko Content contract vendor evidence
- `741ccb44` coordinated candidate release evidence

## Known External Limits

- The Codex in-app browser does not support file upload. The upload/retirement
  workflow remains covered by the existing live-story certification and
  deterministic asset tests; the final browser run verified the populated media
  library but could not transmit a new file.
- The real consumer provides one smoke user, so the final browser run could
  not repeat A-to-B replacement. The packed-candidate identity replacement proof
  and Better Convex Nuxt deterministic race suite remain the executable evidence.
- The real consumer production audit has one low-severity `elliptic` advisory
  under the required `secure-exec` browser polyfill. The advisory reports no
  patched version. Ginko CMS itself reports no known production vulnerabilities.
- The consumer deployment has no website-refresh target configured. Publishing
  correctly queues refresh work; local public reads update directly from Convex.
