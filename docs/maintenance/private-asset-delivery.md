# Private asset delivery candidate

Prepared locally on 2026-09-28. This is a coordinated host/backend change, not a completed hosted acceptance or a storage migration.

Studio metadata, draft-preview asset fields and body images, and `resolveAssetUrls` use `/api/_ginko/assets/<assetId>` rather than returning storage URLs. Published projection facts keep their existing public URLs. A component-only descriptor query checks current CMS read permission; it must never receive a public host query wrapper. The host HTTP handler derives the caller from a verified Convex-session identity and checks the descriptor again after reading each chunk. Membership revocation, trash or replacement during the read prevents that chunk from being returned.

The Nuxt endpoint exchanges the current session through `serverConvex(..., { auth: 'required' })`. It sends the resulting token only to the configured Convex site endpoint. The Convex handler fetches storage without that token. Responses use private/no-store, nosniff and same-origin resource policy; upstream cookies, redirects and CORS headers are not forwarded. Browser HEAD and Range requests are rejected.

## Size and hosting boundaries

[Convex HTTP responses are limited to 20 MB](https://docs.convex.dev/file-storage/serve-files). The existing CMS policy allows 25 MiB images, so each Convex response contains at most 4 MiB. The Nuxt host streams these chunks into one response. Subsequent chunks must match the first chunk's SHA-256, total length and media type; each chunk repeats authorization. A replacement or revocation between chunks fails the stream instead of combining revisions.

The installed Nitro 2.13.4 Vercel preset emits `supportsResponseStreaming: true`. H3 1.15.11 streams a returned `ReadableStream` to the Node response. This code does not return a buffered 25 MiB response. [Vercel recommends streaming when a response cannot fit its ordinary payload limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions). A hosted 25 MiB test through the final Vercel preset, private route rules and CDN remains required; local mocked transport success does not establish hosted behavior.

## Integration owned by lane B

1. Export `assetDeliveryHttp` as `@lupinum/ginko-cms-convex/assets`; regenerate the component declaration including `assets.getAssetDeliveryDescriptor`.
2. Generate a host `ginkoCms/assetDelivery.ts` HTTP action calling `handleGinkoAssetRequest(ctx, request, { descriptorQuery: components.ginkoCms.assets.getAssetDeliveryDescriptor, storageOrigin })`. Bind `storageOrigin` to the configured deployment cloud origin, never request data.
3. Register the host GET path prefix `/ginko/assets/` and the Nuxt GET route `/api/_ginko/assets/:assetId` backed by `server/routes/private-asset`.
4. Include `/api/_ginko/assets` in `protectPrivateRoutes` and test inherited catch-all cache/ISR/SWR rules. Response headers alone cannot prevent an outer route cache from running first.
5. Apply the gateway registration and metadata URL change together in the review candidate. For deployment, install the host route before activating the backend URL mapping. Rebuild the installed-package consumer and verify Studio upload, image selection, preview and reload with two real sessions.

## Existing storage capabilities

No storage objects were rotated or deleted. Previously issued storage URLs remain bearer capabilities. Convex's documentation distinguishes safe-to-pass storage IDs from bearer download URLs; the `convex-test` mock's derivable URL shape is not proof of the real provider's URL contract. Browser uploads currently receive a storage ID from the provider and pass it to the owner-bound claim operation. A disposable real local backend probe confirmed that `getUrl` returns a different URL from `/api/storage/<storageId>`: the actual URL returned the exact synthetic bytes with HTTP 200, while the ID-only guess returned HTTP 400. This rules out the mock's simple derivation for that local backend; it does not prove all hosted/provider URL behavior.

Public URLs are created by `buildPublicAssetFacts` and published replacement projections. Operator portability can obtain a storage URL through its existing server-sealed download attempt; this gateway does not replace that authority. Storage diagnostics compute URLs but return only health counts. The new descriptor is restricted to server-to-component HTTP delivery. Existing draft URLs, retained exports and published derivatives need an explicit inventory before claiming comprehensive revocation; any required private-only storage rotation must preserve asset IDs, existing published revisions and recovery holds.

## Local evidence and open gates

Synthetic tests cover both HTTP layers together just below and above 20 MB, above 20 MiB and at 25 MiB; per-chunk authorization, changed revisions, provider ranges and ignored ranges, invalid lengths, anonymous/nonmember access, HEAD/Range, and header containment. The focused selection passes 183 tests across nine files, including existing upload/replacement and publication behavior. Contract and component strict typechecks, the module/Studio production build, runtime/Studio typechecks, publish-specifier check, workspace lint and formatting pass. Independent adversarial review covered both chunk boundaries and Node response disconnect cleanup. A disposable local host-storage probe also confirmed exact HTTP 206 byte ranges (`bytes 100-199/4096`, 100 matching bytes); its object was deleted, its internal helper removed, and the application redeployed locally. Real local browser verification, hosted provider behavior, installed-package consumer acceptance, hosted 25 MiB delivery and Claude's review remain open.

The draft-preview regression explicitly checks both a structured image field and an Editor image source against the gateway path, verifies the full preview contains no raw storage URL, and confirms publishing that same fixture still produces public storage facts. It reuses the existing fact validation and switches only delivery URLs; no second preview or authorization service was introduced.
