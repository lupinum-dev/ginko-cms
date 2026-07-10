# V-next Release Evidence

Date: 2026-07-10

## Candidate Tuple

- Ginko Content `0.3.0`: `c9d69e1ffd99a5a32a309658e354e4f8d1ad3ef9059739a61a6ead1aee3c5574`
- Better Convex Nuxt `0.6.0`: `610484b0281429fabfa33a84e565f5b46d28a0cbaf1ee465a115c62280e6c927`
- Ginko CMS Contract `0.1.1`: `c9f983fc1382a808e203353f4edfee4abfa6e4af20ce5e808d141e72a21f6510`
- Ginko CMS Convex `0.1.2`: `79e228a2e03396128be34138853c031168601e1dac2eb91e84653e0f50ab403f`
- Ginko CMS `0.1.3`: `7093a216c2ed94c6411ddd631c30d5babfaa91750640bc4a4c8f037e6bab889f`

The dependency artifacts were installed by exact file and SHA-256. The consumer
lockfile contained no `workspace:` or `link:` resolution.

## Deterministic Evidence

- `pnpm run check`: passed; 107 test files and 841 tests passed, with one
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

Browser certification is **blocked**, so this document is not publication
approval. The configured live environment accepts Convex deployment but stalls
all SSR requests during authentication initialization, including `/studio`,
`/studio/auth/signin`, and the smoke API route. No credential or opaque cause was
printed or exposed.

The following scenarios remain mandatory before publication: signed-out route
protection, sign-in, Studio shell, public reads, content CRUD/publish,
pagination, mutation/action errors, upload, API-key creation/revocation, live
updates, sign-out, and A-to-B identity replacement.

## Commits

- `48d197db` secure opaque-error boundaries
- `52e17419` exact dependency artifact verification
- `2614a41b` reproducible Content vendor verification
- `c4ef6760` V-next release documentation
- The following certification commit contains provider response validation,
  page-less-host Studio routing, package reproducibility, and this evidence.
