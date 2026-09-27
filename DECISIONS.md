# CMS integration decisions

## 2026-09-28 — Existing experience is the integration base

The local `codex/cms-overnight-integration` branch starts at experience `2f4cc02`.
The eight editor-integration commits were compared by content: experience retains
Editor adoption, image metadata/picking/late URL resolution, locale/create flush,
and reader-preview flush. Its newer field-scoped draft session replaces the
intermediate scalar queue. Do not replay that older queue over it.

Port the body rooms from shared-editor `ba9088d` by contract, retaining the
experience branch's structured pages and publication/review workflows. Local
Editor and Content previews are development inputs, not registry/release proof.
No account or deployment migration is implied by installing their archives.

## 2026-09-28 — Two concurrency models, one body writer

Scalar fields use the existing field-scoped compare-and-set draft session.
Shared rich text uses Editor operations at an exact room epoch/version. The
component accepts operations, derives Markdown, and writes the room, canonical
draft, aggregate draft version, asset references and search checkpoint in one
transaction. Browser Markdown from a shared editor is a preview, not a write.

Source/import/rollback/contract-transition writers invalidate an existing room
in their draft transaction. Hash comparison alone is insufficient: an A → B → A
source replacement must not revive old operations. The next authorized open
rebuilds the room from accepted source with a new epoch. Publication continues
to compare the aggregate accepted draft version after pending editors flush.

B owns canonical draft writers, schema, generated types, root package files and
host registration. C owns asset operations, private media transport and MCP
orchestration. C calls existing draft/review operations: it does not introduce a
second draft authority or publication review system. Private asset delivery
must authorize each request; published asset facts keep their existing contract.

## 2026-09-28 — Compact generated types without weaker validation

Convex 1.42.2 generates component API types from serialized validators and has
no source-alias preservation option (`component_api.ts` / `validator_helpers.ts`).
The component generation command factors only the exact finite recursive JSON
union into private aliases. Runtime validators and depth limits stay unchanged.
The output is derived, deterministic, idempotent and checked for equivalent
assignability; a raw Convex regeneration is followed by `prepare:component`.
