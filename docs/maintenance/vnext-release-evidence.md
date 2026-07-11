# V-next Release Evidence

Date: 2026-07-11

## Candidate Tuple

- Ginko Content `0.3.0`: `c9d69e1ffd99a5a32a309658e354e4f8d1ad3ef9059739a61a6ead1aee3c5574`
- Better Convex Nuxt `0.6.0`: `610484b0281429fabfa33a84e565f5b46d28a0cbaf1ee465a115c62280e6c927`
- Ginko CMS Contract `0.1.1`: `c9f983fc1382a808e203353f4edfee4abfa6e4af20ce5e808d141e72a21f6510`
- Ginko CMS Convex `0.1.2`: `79e228a2e03396128be34138853c031168601e1dac2eb91e84653e0f50ab403f`
- Ginko CMS `0.1.3`: `6423cf30883da688dc64560195ddbcaf7412f71c520e5412b0f6d221bd39061a`

The dependency artifacts were installed by exact file and SHA-256. The consumer
lockfile contained no `workspace:` or `link:` resolution.

## Deterministic Evidence

- `pnpm run check`: passed; 107 test files and 843 tests passed, with one
  explicitly skipped test.
- `pnpm run audit:prod`: passed with no known vulnerabilities.
- Two serial candidate package runs produced identical evidence manifests and
  byte-identical Contract, Convex, and CMS tarballs.
- The packed consumer passed initialization, doctor, offline Convex codegen,
  Nuxt preparation/typechecking, and public package import probes.
- A live candidate run successfully deployed the packed Convex functions.
- A production Nuxt build from the packed consumer completed and contained the
  Studio host plus sign-in/register chunks.

## Browser Certification

Browser certification is **partially complete**, so this document is not yet
publication approval. The in-app browser verified signed-out route protection,
registration and sign-in, authenticated Studio loading, collection navigation,
draft creation, preview, publishing, unpublishing, archiving, API-key creation
and revocation, sign-out, and protected-route denial after sign-out. The packed
production server returned `/studio`, `/studio/auth/signin`, and the server
smoke API without the previous SSR stall. The smoke deployment's temporary
origin, owner-email, and membership adjustments were restored after the run.

The following scenarios remain mandatory before publication: public
unauthenticated content reads, pagination under live updates, explicit
mutation/action error rendering, file upload, duplicate-subscription inspection,
and A-to-B identity replacement with two principals. The legacy live-story
smoke harness also requires alignment with the current `blog`/`authors` fixture
before it can serve as coordinated release evidence.

## Commits

- `48d197db` secure opaque-error boundaries
- `52e17419` exact dependency artifact verification
- `2614a41b` reproducible Content vendor verification
- `c4ef6760` V-next release documentation
- `7d305d42` coordinated candidate certification and provider validation
- `177d9fc1` build-time Studio routing and locale-less SSR fix
- `80233596` callable Better Auth API-key client support
- `08c446af` stable sign-in/sign-up hydration
