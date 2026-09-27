# Remote image ingest preparation

Status: transport prepared locally on 2026-09-28; no import route or MCP tool is enabled by this change.

`packages/cms/src/server/utils/remote-image-download.ts` downloads untrusted image bytes in the Node host. It accepts HTTPS hostnames on port 443, resolves all addresses, rejects nonpublic answers, and pins the checked address into the connection. TLS still verifies the original hostname. Redirects, URL credentials, compressed responses and unsupported media types are rejected. The shared asset policy supplies the 25 MiB size limit and allowed image types; a 15-second deadline covers DNS, connection and body reading. Signed source URLs must never be stored or logged.

This helper does not establish image validity or create an asset. The existing `finalizeAssetUploadSessionHandler` owns byte-level image validation and calls the mutation that checks the current member authority, upload generation and storage ownership before recording the durable asset ID. That remains the only asset finalization path.

Before exposing ingest:

1. Authorize the caller before any external download. Bind the import to an owned upload session and preserve its identity across retries; do not create a new asset for every MCP retry.
2. Use the existing upload/claim/finalize operations and return the durable asset ID. Preserve the existing review authority for entry publication.
3. Complete private draft-media delivery. Current `mapAsset` and `resolveAssetUrls` return storage URLs that remain bearer capabilities; adding a protected query around them does not make the resulting URL private. Test anonymous, nonmember, revoked and authorized second-member delivery before exposing chat imports.
4. Run the real ChatGPT OAuth and attachment spike against an authorized reachable endpoint. Confirm the actual attachment URL and redirect behavior. If redirects are required, design and test validation and DNS pinning for every hop before enabling them.

Local evidence: 61 remote-download boundary tests and the 11 existing portability transport tests pass. The new source and tests pass focused strict TypeScript, ESLint and formatting checks. Transport tests replace DNS and HTTPS with synthetic responses; they do not prove a live TLS handshake, hosted behavior or the ChatGPT attachment contract. Full package/consumer acceptance and independent review remain required before release.
