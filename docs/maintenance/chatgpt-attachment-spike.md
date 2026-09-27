# ChatGPT attachment spike: offline evidence and next setup

Prepared on 2026-09-28. The offline probe passes through real MCP `tools/list` and `tools/call` handling with `defineMcpTool`. It opens no listener, makes no external request, and writes no CMS data. It is a diagnostic fixture, not an enabled `import-image` tool or proof of a ChatGPT connection.

Run it with a built current better-convex MCP package:

```sh
node scripts/spikes/chatgpt-attachment-spike.mjs /absolute/path/to/better-convex/packages/mcp
```

An extracted candidate archive also works when its exact SDK peer dependencies are available. The verified local candidate was `@lupinum/better-convex-mcp@1.0.0-rc.0`, with `@modelcontextprotocol/server@2.1.0`; archive SHA-256 `cb254da29a7d52da2ef45f61ceb12867cd70565261cf74df6f82b003efdfc8cc`. This is a local runtime candidate, not a published artifact or CMS dependency upgrade.

## Contract proved locally

The [official file-input contract](https://developers.openai.com/plugins/reference#define-file-inputs) requires each `_meta["openai/fileParams"]` name to identify a top-level file object or array. The fixture names `images`, an array of file objects. All four properties are declared: `download_url`, `file_id`, `mime_type`, `file_name`. Only `download_url` and `file_id` are required. The optional metadata is neither assumed present nor trusted as validated image content.

The test reads the actual tools catalog and verifies that serialization preserves this shape and the OAuth scope declaration. It calls the tool twice with two synthetic images, one without optional metadata. Malformed objects, missing required fields, camel-case names, invalid URLs and empty arrays are rejected before the handler. Wrong and revoked synthetic credentials cannot invoke the handler. Diagnostic output contains only counts and field-presence booleans; it never returns provider IDs, signed URLs or filenames. Repetition is harmless because this probe has no effects. It does not establish idempotent asset creation.

The probe accepts a candidate path explicitly because the CMS base still depends on the older MCP API. It does not change package manifests, install a second production dependency, or silently migrate the existing endpoint.

## Real-client setup still required

1. Complete the reviewed better-convex API cutover and the private asset gateway registration. Preserve the current OAuth delegation, entry writer and review authority.
2. Obtain authorization for a reachable development endpoint and the ChatGPT connection. No public tunnel, cloud deployment or connector was created during overnight preparation. Copy the actual callback from the client's connection setup; do not guess it.
3. Register the diagnostic definition only in that disposable development endpoint through its existing OAuth access verifier. Request the smallest read scope for this no-write probe. Never substitute the synthetic verifier from the offline script.
4. Connect ChatGPT and send two images. Record only safe facts: whether each field arrived, array support, URL origin, expiry behavior and whether redirects are required. Keep signed URLs, tokens and file IDs out of logs and reports. Preserve `file_id` only where the real client refresh contract requires it.
5. Repeat with Claude as a diagnostic client. This does not substitute for ChatGPT evidence.
6. Remove the probe when the real attachment contract has been recorded. The production `import-image` tool must authorize before download, reuse the existing owned upload/finalization operations and persist a durable asset ID. Request identity across retries remains a domain acceptance gate; the repeated upload-claim fix alone does not establish whole-import idempotence.

Existing URL ingestion rejects redirects. Real attachment URLs may require a bounded, revalidated redirect policy; do not relax the transport from an unverified assumption. Hosted 25 MiB delivery, two real user sessions and the full ChatGPT-to-draft journey remain separate acceptance gates.
