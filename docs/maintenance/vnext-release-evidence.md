# V-next Release Evidence

Date: 2026-07-11

## Candidate Tuple

- Ginko Content `0.3.0`: `664ceae059e93d981f0cb83827ac4c67663ca79ad0a426be32de3b0795cadb8b`
- Better Convex Nuxt `0.6.0`: `610484b0281429fabfa33a84e565f5b46d28a0cbaf1ee465a115c62280e6c927`
- Ginko CMS Contract `0.1.1`: `c9f983fc1382a808e203353f4edfee4abfa6e4af20ce5e808d141e72a21f6510`
- Ginko CMS Convex `0.1.2`: `79e228a2e03396128be34138853c031168601e1dac2eb91e84653e0f50ab403f`
- Ginko CMS `0.1.3`: `aeb61be8087b3afd99421edd97cdf519bacf730807e4ba370d30dca8e2d5bd07`

The dependency artifacts were installed by exact file and SHA-256. The consumer
lockfile contained no `workspace:` or `link:` resolution.

## Deterministic Evidence

- `pnpm run check`: passed; 107 test files and 844 tests passed, with one
  explicitly skipped test.
- `pnpm run audit:prod`: passed with no known vulnerabilities.
- Two serial candidate package runs produced identical evidence manifests and
  byte-identical Contract, Convex, and CMS tarballs.
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

Browser certification is **partially complete**, so this document is not yet
publication approval. The in-app browser verified signed-out route protection,
registration and sign-in, authenticated Studio loading, collection navigation,
draft creation, preview, publishing, unpublishing, archiving, API-key creation
and revocation, sign-out, and protected-route denial after sign-out. The packed
production server returned `/studio`, `/studio/auth/signin`, and the server
smoke API without the previous SSR stall. The smoke deployment's temporary
origin, owner-email, and membership adjustments were restored after the run.

The live-story harness is aligned with the current `blog` fixture. It now creates
an isolated entry, exercises public unauthenticated reads and MCP reads, uploads
and retires an image, then unpublishes and archives the temporary entry. The
harness passes formatting and strict lint checks. Its final live run is pending:
the local environment still provides the removed `CMS_SMOKE_EMAIL` and
`CMS_SMOKE_PASSWORD` names, and those credentials were rejected by the live auth
service with HTTP 403. Set valid `GINKO_CMS_TEST_EMAIL` and
`GINKO_CMS_TEST_PASSWORD` values before rerunning it.

The following live scenarios therefore remain mandatory before publication: a
successful aligned live-story run (including upload), explicit mutation/action
error rendering, and A-to-B identity replacement with two principals. The
identity replacement scenario requires credentials for two distinct test
principals.

## Commits

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
