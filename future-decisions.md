# Future Decisions

## Ginko Content Tree Support For CMS

Decision for now: do not open a Ginko Content PR for CMS tree handling.

Ginko Content and Ginko CMS share the same tree invariant, but not the same
tree source model. Ginko Content derives navigation from filesystem paths,
numeric filenames, index-file promotion, `.navigation.yml`, synthetic folders,
and canonical projection. Ginko CMS owns parent-id plus sibling-rank placement.
The useful shared behavior is the rule: build a canonical tree first, sort only
within sibling groups, then flatten or project in pre-order.

That rule is small enough, and the input models differ enough, that sharing a
public tree-builder utility would add more coupling than value. It would either
leak filesystem assumptions into CMS or force Ginko Content to expose a generic
adapter surface that is not currently needed.

Potential future Ginko Content PRs that could make sense:

- Strengthen provider contract tests so `navigation()` must return stable
  parent-before-child order.
- Document that provider navigation is a canonical tree projection and consumers
  must not infer hierarchy from global sort order.

Avoid for now:

- Exporting a public generic tree builder from Ginko Content.
- Moving CMS parent/rank policy into Ginko Content.
- Adding CMS compatibility paths around filesystem-only behavior such as numeric
  filename sorting, index promotion, or synthetic pathless folders.

Open parity question:

CMS public `surround` currently uses sibling-only `parentEntryId + orderKey`
semantics. Ginko Content flattens navigation in pre-order for surroundings.
If exact parity becomes a product requirement, decide intentionally whether CMS
surround should remain sibling-local or switch to navigation-flattened previous
and next behavior.

## Post Targeted Cleanup Follow-Ups

Snapshot: 2026-07-07 targeted cleanup after the marketer publishing workflow
refactor.

Decision for now: continue frontend and Studio workflow work on the cleaned
foundation, but keep the backend cleanup below visible. The foundation is much
better than before because Studio now treats backend `EntryReadinessDetail` as
the primary workflow truth, MCP publish preview is run-bound, human review
requests are first-class, and required-field publish blockers use one backend
collector.

Do not re-open these unless a concrete product requirement changes:

- Do not add stored workflow/readiness state.
- Do not add a readiness table or projection.
- Do not make the public provider consume draft readiness.
- Do not make diagnostics the primary marketer workflow model again.
- Do not wrap MCP restore in destructive confirmation; keep it as a guarded
  bounded write.
- Do not remove deprecated public aliases unless release status confirms a hard
  cutover is safe.

Important deferred work:

- Split large backend files along real ownership boundaries.
  `packages/convex/src/diagnostics.ts`,
  `packages/convex/src/entries/workflow/commands.ts`,
  `packages/convex/src/entries/read.ts`, and
  `packages/contract/src/validators.ts` remain too large. Do this only as a
  safe extraction with tests; do not create generic service/adaptor layers just
  to reduce line count.
- Split the largest behavior test files once the next reviewer asks for that
  cleanup or once a nearby behavior change needs it. The current hardening pass
  added the missing invariants and kept the full suite green, but
  `test/component/entries/publish.test.ts` and `test/component/diagnostics.test.ts`
  are still too broad. When splitting them, move existing tests first into
  focused files for data-only publish, route/subtree publish, i18n publish,
  required-field/readiness diagnostics, route diagnostics, and projection
  maintenance diagnostics. Do not rewrite helpers broadly during that move.
- Extract a clearer publishability core. Required-field collection is now
  shared, but publishability is still spread across publish impact, readiness,
  review stale checks, and publish execution. Future work should make it obvious
  that adding a blocker changes one backend path.
- Keep exact readiness and publish execution locked together. A future invariant
  test should prove exact readiness never says `ready` for a locale/version that
  publish execution would reject.
- Keep dashboard/list state conservative. Lists should use the same vocabulary
  as exact readiness, but they should not run expensive exact readiness for
  every row.
- Run a browser/package smoke pass before any release candidate. The full local
  check passed after the cleanup, but the latest cleanup did not include a fresh
  browser smoke against a packed consumer.

Biggest current weaknesses:

- Route and subtree publish behavior is the most fragile product area. Parent
  route changes affect descendant public URLs, redirects, route collisions,
  sitemap/search/nav state, and cache delivery. Keep strong preview/execute
  tests around this area before adding more UI affordances.
- The advanced diagnostics UI can drift back into being a second workflow model.
  It is useful for developers and power users, but marketer-facing state should
  stay `Write -> Check -> Preview -> Review -> Publish -> Track`.
- i18n remains a high-risk cross-cutting concern. Missing locales, translated
  slugs, fallback/default locale behavior, language switching, SEO alternates,
  sitemap inclusion, and public provider output must stay aligned.
- AI/MCP is powerful by design and must stay operation-bound. Agents should be
  able to publish when permissioned, but every write needs auth, scope,
  active-run guarding where applicable, and auditability.
- Review workflow now supports humans and agents, but product polish is still
  needed: clearer requester identity, better review summaries, stale-review
  explanations, and approval/rollback confidence for real editorial teams.
- Build and lint warnings remain tolerable but noisy. Existing `any` warnings in
  Convex helper infrastructure and Studio bundle-size warnings are not release
  blockers today, but they can hide future signal if left forever.

Future acceptance checks before calling this area mature:

- A marketer can explain every entry state without knowing about Convex tables,
  projections, cache tags, or confirmation tokens.
- Studio, MCP, review inbox, publish dialog, and dashboard use one readiness
  vocabulary.
- Public reads stay projection-only.
- Agents and humans use the same CMS operations for the same permission level.
- Advanced diagnostics can be hidden without losing the core editorial workflow.
- Large backend files are either split safely or explicitly accepted by a
  reviewer for the next release.
