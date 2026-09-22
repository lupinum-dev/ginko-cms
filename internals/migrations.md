# Active migrations

## Content and Editor local candidate overrides

- Why it exists: Studio uses the standalone Editor with Content's checked parser and authoring contracts. The earlier Content beta.8 candidate does not contain those APIs. This branch requires the reviewed Content beta.9 structured-page candidate and Editor 0.1.0 archive.
- Introduced: 2026-09-22; supersedes the beta.8 override introduced on 2026-09-09.
- Owner: CMS integration coordinator.
- Depends on it: local source checks, Studio builds, the CMS experience pilot, and packed consumer checks. Host applications consume the built Studio; they do not need to install Editor separately.
- Exact identities: `packages/cms/compatibility.json` records archive hashes and source commits with `local-source-candidate-only` certification. Archives live under ignored `.pack/upstream/`; package manifests retain portable version specifiers.
- Removal condition: publish these reviewed Content and Editor artifacts after approval, record their registry provenance, remove both workspace overrides, regenerate the lockfile from the registry, and pass package/consumer checks against the same bytes.
- Rollback: before contract deployment, revert this integration tuple and reinstall the earlier lockfile. After deploying a structured-page contract, first migrate entries using the reviewed contract rollback procedure; do not run an older consumer against unsupported contracts. No persisted document format is migrated by Editor adoption itself.
- Tracking issue: none; autonomous CMS goal and integration acceptance checklist track this local release gate.
