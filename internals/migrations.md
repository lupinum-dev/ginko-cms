# Active migrations

## Content component-policy V1/V2 transition window

- **Why it exists:** Ginko Content policy V2 adds literal-value, union-type, asset, and nesting rules that V1 cannot represent. CMS must read both versions while installed contracts and portable artifacts move through the reviewed V1/V2 transition lane.
- **Introduced:** 2026-09-12, Ginko Editor Step 4B.
- **What depends on it:** CMS contract readers, portable import/export, public projection validation, and the exact no-write V1-to-V2/V2-to-V1 contract transition path.
- **Removal condition:** Remove V1 reader support and this entry together after every supported installed contract and portable artifact has policy V2, the rollback window has closed, and registry-only consumer evidence proves no supported integration still emits V1.
- **Tracking issue:** `ginko-editor/plan.md`, Step 4 / Gate B2; no external issue yet.

## Editor prepublication archive

- Introduced: 2026-09-22.
- Reason: the CMS backend now imports the shared Editor runtime. Editor 0.1.0
  has not had its first npm release. Public package manifests declare the real
  version; the private workspace override installs the reviewed archive recorded
  in `internals/candidates/editor.json`.
- Dependents: local workspace installation and non-registry packed-consumer
  certification. Registry certification never substitutes this archive.
- Removal condition: Editor 0.1.0 is published from the verified release artifact
  and its registry provenance/bytes are accepted. Remove the workspace override,
  archive/metadata, candidate handling in `scripts/package-e2e.mjs`, and this entry;
  regenerate the lockfile and pass registry packed-consumer checks.
- Tracking: Ginko Editor issue 6. No registry publication is claimed by local checks.
