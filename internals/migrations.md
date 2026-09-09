# Active Migrations

## Ginko Content beta.8 local candidate override

- Why it exists: Ginko CMS needs the reviewed beta.8 portability contract, but that exact Ginko Content version is not yet available from npm.
- Introduced: 2026-09-09 during the Better Convex beta.5 registry cutover.
- Depends on it: local source checks and the Lupinum website migration trial.
- Removal condition: publish the reviewed `@lupinum/ginko-content@1.0.0-beta.8` artifact, record its registry provenance in `packages/cms/compatibility.json`, remove the workspace override, regenerate the lockfile from the registry, and pass the machine-independent lockfile test.
- Tracking issue: none; the active continuation automation tracks this release gate.
