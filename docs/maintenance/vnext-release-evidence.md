# V-next Release Evidence

Date: 2026-07-11

## Candidate Tuple

- Ginko Content `0.3.0`: `808bf3bf708dcb5329d2e3f8360ed89fe8a3e411e35495323a31330477af3905`
- Better Convex Nuxt `0.6.0`: `8bfe3a119601e3322dffccd5787df9619ad6fa76eead255a961c7f9314ed6ca0`
- Ginko CMS Contract `0.1.1`: `c9f983fc1382a808e203353f4edfee4abfa6e4af20ce5e808d141e72a21f6510`
- Ginko CMS Convex `0.1.2`: `79e228a2e03396128be34138853c031168601e1dac2eb91e84653e0f50ab403f`
- Ginko CMS `0.1.3`: `d2671d9fcc9ac339a2460c67a3455a19f91d965cf8d8c092b7b1504dd4c18cdf`

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

- `db2d0499` setup-safe provider search and empty-query dispatch guard
- `0f8eb3e0` runtime-resolvable Better Convex Nuxt server entry
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
