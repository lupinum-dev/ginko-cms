# Collaborative Studio and website editing proof of concept

Date: 15 September 2026

Status: first landing-page prototype implemented in the playground; local bidirectional draft synchronization and published/draft isolation verified. Full two-person and hosted-delivery acceptance remain open.

## Implementation evidence so far

The following is observed evidence from 15 September 2026. Later milestones describe the intended product, not completed functionality.

- Added a `landing` collection and a shared Vue landing template for public and private rendering. The illustration is static; image editing is not implemented.
- Added inline editing for headline, introduction, eyebrow, button label and destination. Edits autosave after a one-second pause through the existing CMS mutation and expected draft version.
- Verified Studio-to-website headline updates and website-to-Studio introduction updates without reloading either tab. Both browser tabs used the same authenticated owner. This proves synchronization across surfaces, not a complete two-person session workflow.
- Published a synthetic entry through the existing Studio confirmation flow against an isolated local Convex backend. The public route changed from 404 to rendered published HTML without a frontend rebuild.
- Saved another headline afterward. Anonymous HTTP reads continued to contain the published headline and excluded the new draft headline.
- Real anonymous and signed-in non-member API clients were denied draft reads and writes. A stale owner write was rejected with `ENTRY_CONCURRENT_EDIT`.
- Verified the private preview response has `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`; its anonymous HTML contains no draft text.
- Inspected the real desktop template and narrow-screen inline controls. The initial preview hydration mismatch was addressed with a client-only rendering boundary; a complete authenticated reload recheck is still pending.
- Fifteen focused draft-state and backend-preview tests passed. These include preserving local text, mutation/query ordering and rejecting unsafe links. They do not establish character-level text merging or browser IME correctness.

### Open limits and findings

- A second synthetic account authenticated, but could not accept its invitation because its email was unverified. The playground's Ginko auth helper does not expose verification delivery. No verification or membership check was bypassed. Complete this onboarding path before claiming a two-person demo.
- Conflicts currently preserve local text and offer an explicit reload of the shared draft. There is no automatic field merge, presence indicator, shared cursor or collaborative rich-text protocol.
- Publishing still happens in Studio. A direct, prominent Studio-to-page action and a simpler marketer workspace are not yet implemented.
- The blog, editable assets, navigation through private drafts, offline recovery and session renewal need further verification or implementation.
- Local SSR publication is verified. Vercel ISR invalidation, refresh retries, navigation payloads and prerender rebuild delivery are not verified.
- `pnpm run lint` passed. `pnpm run typecheck` exited successfully but emitted a missing `vue-router/volar/sfc-route-blocks` plugin warning. The separate source-linked playground typecheck reported an existing module runtime-config typing issue.
- The aggregate `pnpm run check` stopped at formatting in the pre-existing `plans/2026-09-06-architecture-review.md`; that unrelated document was left untouched. The full test run has no final result recorded yet.
- An isolated Nuxt production build failed resolving the workspace's `node_modules/ohash` through the externalization plugin. A clean production build is still required before hosting claims.

### Current local entry points

- Studio entry: `http://localhost:3400/studio/content/landing/kx73m0fsx1gva4hwd580xp3f318efjh3`
- Private page: `http://localhost:3400/preview/landing/kx73m0fsx1gva4hwd580xp3f318efjh3?locale=en`
- Public page: `http://localhost:3400/landing/home`

The disposable runtime is under ignored `.tmp/inline-poc`, with local Convex on ports 3321/3322. It uses synthetic data and local-only configuration. Existing hosted deployment configuration was not changed. Do not publish or copy its credentials. No dependency manifest or lockfile changes were made. Temporary dependency diagnostics were restored byte-for-byte.

### Recommended next slice

Finish verified-email onboarding, then repeat the demo with two independent users. Add a direct **Edit on website** action that saves pending Studio changes before opening the page. Use the existing backend and roles. Keep the full CMS tools available separately while the default marketer view shows pages, posts, editing and publication only. Validate Vercel delivery before treating this prototype as a deployable light CMS experience.

Source baseline: Ginko CMS `d0e27981`. Recheck the branch, local changes, and applicable instructions before implementation. Preserve the existing architecture review and unrelated work.

## Outcome

A marketer edits in Studio while a colleague opens the same draft in the actual website design. Both see acknowledged changes without refreshing. Either authorized person can edit. Public visitors continue to see published content until an authorized publication reaches the website.

This is an optional editing experience within Ginko CMS, using its existing content model, permissions, assets, publication operations, and refresh queue. The proof must use real authenticated Convex reads and writes. A static mockup, two panels sharing browser memory, or BroadcastChannel synchronization alone cannot establish this outcome.

The first demo contains one designed landing page and one blog article. Start in the existing Nuxt playground and Studio. Do not introduce a new package, CMS datastore, tenancy service, KV copy, or independent authentication client.

## Product contract

### Three participants

| Participant                  | View                                         | Expected behavior                                                                                    |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A: authorized Studio editor  | Existing Studio entry editor                 | Edits the shared draft and receives remote changes safely                                            |
| B: authorized website editor | Same page design in explicit draft/edit mode | Receives A's saved changes, edits fields directly, and sends changes back to A                       |
| C: anonymous visitor         | Normal public page                           | Sees the last delivered publication; cannot read drafts, collaboration metadata, or write operations |

Signing in does not silently replace every public page with draft content. An explicit **Edit this page** or **View draft** action enters draft mode and shows a persistent draft indicator. All participating surfaces use the same entry ID and locale. A collection label or public slug alone is not a document identity.

### Marketer journey

1. A signs into Studio and chooses **Edit on website** for the landing page.
2. B signs in independently and opens the same entry in the website editing view. A may remain in Studio; opening an edit view must not require closing Studio.
3. The website shows its real template and a compact bar: page selector, save state, **Edit / Preview**, **Publish**, and **Exit**. Publish is available only to a publisher under existing CMS permissions.
4. A changes the headline in Studio. B sees the saved change in the website template without navigation or reload.
5. B changes the introduction directly on the page. A receives that saved change in Studio without losing unrelated local work.
6. **Preview** removes editing controls but keeps draft data. Links behave normally in preview and expose editing controls in edit mode. Draft navigation stays within the preview context for supported pages.
7. Before opening a separate saved preview or publishing, flush the active editor and await successful draft persistence. A failed flush/save must not publish older text under a success message.
8. A publisher reviews the saved draft version and publishes it through the existing operation. If another editor saves afterward, the old publication confirmation must be rejected or refreshed; it must not silently publish an unreviewed version.
9. C sees the new version after cache delivery succeeds. Later draft edits remain private.

Use **Saving…**, **Saved privately**, **Connection lost — changes pending**, **Changes need review**, **Updating website…**, and **Live** only when the corresponding state is established. These are separate draft/save and publication/delivery facts, not one persisted status field. A colleague cannot see unsent local keystrokes; describe the first milestone as live shared saved drafts, not character-by-character collaboration.

### Editing scope

- Landing page: plain headline, introduction, image with contextual alt text, and button label/destination. Use named structured fields and the existing asset lifecycle.
- Article: title, excerpt, cover image, slug/SEO fields, and one Markdown/MDC body. Include creation and preview before a public URL exists.
- Public and draft views render shared Vue page components. A generic prose preview is insufficient evidence for a designed landing page.
- Fields are explicitly bound to entry/locale/field identity. Do not infer bindings by parsing DOM text or identify repeatable items by array position.
- Keep unsupported controls out of the first demo. Arbitrary layouts, section builders, comments, scheduling, translation workflows, and transferable guest-preview links are separate work.
- Images and links must work in the actual preview. The current preview's image limitation is part of the implementation gap, not an acceptable final demo state.

## Evidence from the current repository

These are source observations, not evidence of a working two-person deployment.

| Existing capability                                                | Source                                                                                                                                                       | Consequence                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Live entry reads in Studio                                         | [useEntryLoader](../packages/cms/studio-app/src/composables/internal/useEntryLoader.ts)                                                                      | Retain the canonical entry query                                                                     |
| Clean forms receive remote versions; dirty forms block stale saves | [useEntryDraft](../packages/cms/studio-app/src/composables/internal/useEntryDraft.ts)                                                                        | Shared draft behavior exists in part; preserve the protection while improving the experience         |
| Three-second autosave and serialized saves                         | [useEntryDraft](../packages/cms/studio-app/src/composables/internal/useEntryDraft.ts), [save queue](../packages/cms/src/public/editing/session.ts)           | Measure before changing latency; avoid a write and full-body parse on every keystroke                |
| Backend expected draft version check                               | [applyDraftPatch](../packages/convex/src/entries/workflow/drafts.ts)                                                                                         | Never remove it to make the demo appear collaborative                                                |
| Permission-guarded draft data and parsed body                      | [draftPreview](../packages/convex/src/draftPreview.ts)                                                                                                       | Reuse for preview; this currently covers route-backed entries and has no transferable preview tokens |
| Website preview uses useConvexQuery                                | [playground preview](../playground/app/pages/preview/[collection]/[id].vue)                                                                                  | Extend the real preview path instead of building an unrelated simulation                             |
| Canonical save and publish facade                                  | [host editor facade](../packages/cms/templates/convex/ginkoCms/editor.ts)                                                                                    | Website editing must invoke the same domain operations as Studio                                     |
| Publication queues and schedules revalidation                      | [publicationCommands](../packages/convex/src/entries/workflow/publicationCommands.ts), [delivery scheduling](../packages/convex/src/revalidation/targets.ts) | Reuse immediate delivery and retry; no new webhook queue                                             |
| Server-side published reads                                        | [provider transport](../packages/cms/src/nuxt-provider/transport.ts)                                                                                         | Public visitors do not need draft subscriptions                                                      |
| Accepted dependency baseline                                       | [compatibility authority](../packages/cms/compatibility.json)                                                                                                | Start on this tuple; a sibling checkout is not an approved dependency replacement                    |

The [existing architecture review](2026-09-06-architecture-review.md) documents session lifecycle and public projection defects relevant here. Reproduce and fix affected paths as part of their implementation slice. Do not expand this workstream into all unrelated findings from that review.

## Architecture decisions

### Shared content and separate local intent

The existing CMS draft is the shared persisted source. Each editor session holds only the local state required to edit safely: document identity, acknowledged base version, local changes, in-flight save, and save/connection errors.

Both interfaces need the same reconciliation rules. Extract a small internal CMS session mechanism when the two real consumers establish its inputs and lifecycle. Keep router navigation, Studio presentation, and website component bindings in their owning surfaces. Do not export the whole Studio workflow or introduce another subscription registry beside Better Convex.

On a remote update:

1. A clean local field can receive the new value.
2. An unacknowledged local edit must not be replaced by a query result or an older mutation response.
3. For the first proof, a conflicting dirty entry may pause saving and show a review choice. Preserve local text for recovery; never implement recovery by silently dropping it.
4. Improving non-overlapping field edits requires a base/local/remote comparison. Apply only demonstrably disjoint changes, preserve absent versus null values, and retain the backend version check. Treat arrays, parent/child paths, and overlapping rich text as conflicts unless their behavior is specifically implemented and tested.
5. Do not merely replace the expected version with the latest version and resend a stale full form. That would bypass the lost-update protection.

Version conflicts and ambiguous network failures are different. Retry a failed request without treating already-acknowledged work as new intent. A later response must not reset the active document or resurrect discarded edits.

### Levels of collaboration

| Level                                                                    | Workstream treatment                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Two people see the same saved draft across Studio and website            | Required first milestone, using real Convex subscriptions                                                                      |
| Either surface edits; conflicts preserve both people's work              | Required core proof                                                                                                            |
| Different scalar fields update concurrently without unnecessary conflict | Follow the core proof with a bounded reconciliation experiment; adopt only with race evidence                                  |
| Names/avatars and active-field indicators                                | Add if needed to make conflicts understandable; scoped, expiring presence is advisory, not authorization or a correctness lock |
| Two people type in the same rich-text paragraph                          | Dedicated feasibility milestone; requires an editor sync protocol, not full-string replacements                                |

The current same-entry version fence may conflict even when people edit different fields or languages. Record that limitation honestly in the first demo. Do not claim Google Docs-style merging from a successful clean-reader update.

If presence is included, use server-authorized entry/locale scope, bounded update frequency, and expiry/reconnect cleanup. Keep cursor/heartbeat traffic out of content revisions and publication history. Test two distinct users; two tabs under one identity are additional coverage only.

### Rich-text collaboration decision

Investigate Convex's ProseMirror sync component against the actual Vue/Tiptap editor and supported schema before adopting it. The official example uses React bindings; a demonstrated Convex backend is not proof of a supported Vue integration.

The current Ginko Editor contract keeps Markdown/MDC canonical and Tiptap state derived. A durable ProseMirror step stream introduces a real authority decision. The experiment must specify who owns an active document, how an acknowledged collaboration version becomes a validated CMS draft, and how save/restore/publication fences bind that version. Do not create two independently writable Markdown and ProseMirror stores.

Required evidence before adopting a sync protocol: concurrent insertion/deletion, formatting, local undo after remote changes, reconnect/rebase, authorized document access, source fidelity, and publication of exactly the reviewed acknowledged text. A conversion or flush failure must preserve source and block publication. Unsupported MDC cannot be silently normalized away.

Keep this experiment isolated from the first scalar-field proof. Its result may recommend an explicit contract evolution or defer same-paragraph merging while retaining shared drafts. Record the result and tradeoff; do not describe deferral as completed rich-text collaboration.

### Public delivery

Default target: Nuxt on Vercel, published page ISR, and authenticated uncached editing/preview routes. Exclude draft routes and their data from platform caching and prerendering; no-store headers alone are insufficient if a platform cache can serve the route before the handler runs.

Use the existing CMS refresh queue and Ginko Content cache adapter boundary. The inspected Content header adapter does not support invalidation. A real Vercel adapter and hosted evidence are needed before claiming publish-to-live completion.

Test page HTML and Nuxt payloads, direct loads and client navigation, changed article listings, newly published paths/previous cached 404s, and shared-content dependencies. Use a configured canonical delivery origin. Do not assume cache behavior on one preview URL proves another domain.

A CMS publication is not a globally atomic CDN cutover. A refresh acknowledgement alone is not proof that every open browser displays the new version. The proof checks the revision served by affected routes; public browsers are not subscribed to drafts. Record refresh failures separately from saved content, retain retries, and use a bounded time-based revalidation fallback where appropriate.

Alternative target: pre-rendered public routes within a Nuxt server deployment, with live draft/edit routes. Publishing triggers a build from a captured approved revision set; autosave never triggers builds. Keep the last successful deployment available on build failure and distinguish the approved revision from the last delivered one. A completely static nuxt generate output has no Nuxt auth/server routes and is not the first proof's hosting target.

## Implementation sequence

### 0. Establish the executable baseline

Deliverables:

- Record checkout, installed dependency tuple, existing commands, and a contained backend suitable for synthetic data. Inspect target identity before running environment-loading dev commands.
- Use the committed CMS baseline for the first proof. Do not upgrade Content or Better Convex just because newer siblings exist.
- Document legitimate setup for two synthetic authenticated members with existing edit/publish permissions, and a separate anonymous session. No production credentials or auth bypass.
- Identify the shared landing-page fields, article fixture, and exact draft/public route mapping. Preserve existing playground routes and fixtures or migrate their dependents deliberately.

Exit evidence: the existing Studio can save a synthetic entry, the current preview can read it reactively, and anonymous draft access fails. This step establishes an environment; it does not certify the final experience.

### 1. Show the same draft in two surfaces

Deliverables:

- One real landing-page Vue template reused by public and draft views.
- Studio action to open the corresponding website draft, preserving entry/locale identity.
- Persistent draft indicator, edit/preview distinction, and explicit return to public content.
- Studio A changes headline and introduction; website B updates through Convex. Public C stays unchanged.

Exit evidence: two separate authenticated sessions see acknowledged edits without refresh; a new session loads the saved draft; no draft appears in public HTML, payload, or public query output.

### 2. Edit from either surface safely

Deliverables:

- Direct website editing for the named scalar fields, image, and button through existing CMS operations.
- Shared session rules for save ordering, remote updates, focus/composition, errors, navigation, and disposal.
- Visible conflict recovery preserving local edits. Retain the expected-version fence.
- Minimal polish: keyboard-accessible controls, field labels, stable layout, small save indicators, functional image preview, and mobile preview.

Exit evidence: Studio-to-website and website-to-Studio edits persist; concurrent dirty edits cannot overwrite silently; delayed saves cannot write to a different entry or locale after navigation; disconnect/reconnect does not lose or falsely acknowledge local work. Measure acknowledgement-to-remote-display latency separately from the autosave delay.

### 3. Add the article and evaluate stronger collaboration

Deliverables:

- Create and edit a blog article, including title, cover, body, and unpublished preview, using the current accepted writing engine first.
- Run the disjoint-field reconciliation experiment described above.
- Run a bounded same-paragraph sync experiment and record whether it fits Vue, Ginko's source contract, auth, and publication semantics. This is a decision gate, not automatic dependency adoption.
- Add entry/field presence only if it helps the demonstrated journey; record costs and expiry behavior.

Ginko Editor adoption has its own compatibility gate: its local release plan records Content parser-export/version requirements. Complete that gate before changing CMS to the standalone editor. Do not make the initial live-draft experiment depend on a broad package-release migration.

Exit evidence: an unpublished article renders in the actual website template and synchronizes across surfaces. The stronger-collaboration experiment has measured results, a clear content-authority design, and an explicit adopt/defer decision with remaining limitations.

### 4. Prove publication and caching

Deliverables:

- Publish the acknowledged, reviewed draft via the existing preview/confirmation/execute operation.
- Implement the Vercel cache integration at Content's existing adapter boundary and configure its existing revalidation target.
- Show saved/published/delivery state without marking failed delivery live.
- Optionally demonstrate pre-rendered delivery as a second adapter path after ISR works; it is not required for the first no-rebuild proof.

Exit evidence: on a disposable authorized Vercel target, anonymous C receives the intended publication, including navigation payload/listing changes, without an application deployment. A forced refresh failure retries; drafts saved afterward remain private. A build or local cache mock does not count as this hosted evidence.

### 5. Decide integration into the main CMS experience

Deliverables:

- Review the real marketer journey and the evidence below.
- Identify the smallest stable CMS session/field-binding API and the portable Editor primitive, based on actual consumers.
- Decide whether Studio needs an optional UI registration setting. Studio-off support is not required to prove Studio and website collaboration.
- Record changes needed for adoption, known limits, rollout/rollback, and affected tests/contracts. Remove unused experiment code and track any necessary temporary compatibility path in the owning repository's migration record.

Exit decision: adopt the proven experience into CMS, refine a named blocker, or stop the experiment. No new library or general collaboration framework is justified solely by the proof existing.

## Acceptance matrix

Record each row as unverified, passed, failed, or explicitly deferred with a reason. The implementation evidence above records the limited checks completed so far; the matrix below remains the full acceptance target.

| Scenario                                   | Required observation                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| A edits; B watches                         | B receives the acknowledged draft without reload                                                                   |
| B edits; A watches                         | Studio receives the draft without reload                                                                           |
| Both dirty, same field                     | No lost text; conflict is visible and recoverable, or a proven sync protocol merges correctly                      |
| Both dirty, different fields               | Initial conflict behavior is honest; any automatic reconciliation preserves both edits under repeated races        |
| Mutation and query arrive in either order  | Acknowledged version and local intent remain consistent                                                            |
| Navigation/locale switch with pending work | No stale response, upload, timer, or queued save mutates the new document                                          |
| IME composition, typing, and undo          | Remote data does not destroy the cursor/composition or undo another user's work unexpectedly                       |
| Disconnect and reconnect                   | Unsaved state stays distinguishable from saved state; replay does not overwrite newer work                         |
| New article                                | Preview works before publication; published listing and route appear afterward                                     |
| Publish races with another editor          | Confirmation is version-bound; no unreviewed text is published silently                                            |
| Anonymous and unauthorized member          | Draft reads, writes, assets where restricted, and presence are denied appropriately                                |
| Membership revoked                         | Further reads/writes fail and protected UI state is cleared; already disclosed text cannot be retroactively unseen |
| Public rendering                           | No draft text or editor assets leak into cached public responses                                                   |
| Vercel refresh                             | Expected revision appears in HTML and payload/navigation; failed delivery is visible and retried                   |
| Publication followed by another edit       | Public page remains on the approved revision                                                                       |
| Restoring/reverting a draft                | Other sessions reconcile safely; restore respects existing version/confirmation rules                              |
| Optional static delivery                   | Builds use one approved revision set; failed or outdated builds cannot be reported as the current live publication |

Capture versions, exact commands, synthetic roles, route/viewport, observed timings and relevant request/write counts. Record meaningful evidence without credentials or private session exports. No arbitrary performance number is claimed in advance; compare observed delay against a stated demo target and distinguish local from hosted measurements.

Use focused behavioral tests for session races and backend authorization, then the repository's applicable checks. For implementation, inspect the real two-user interface and hosted cache behavior where authorized. Follow active user verification restrictions and record any unrun checks explicitly. Planning-only work needs document/link review, not an application test run.

## First implementation task

Implement milestones 0 and 1 in the existing Ginko CMS playground: synthetic landing-page draft, shared public/draft template, Studio-to-website navigation, live authenticated viewing by a second user, and anonymous published-only viewing. Keep the current dependency tuple and existing version/publication protections. Return the exact startup/entry points, two-user evidence, and limitations before broadening to website writes or a text-sync protocol.

This is the first executable slice, not completion of the whole proof. Milestones 2 and 4 are required to establish bidirectional editing and no-rebuild delivery; milestone 3 determines the richer collaboration contract.

## Sources and limits

- [Convex reactive queries](https://docs.convex.dev/understanding/overview): subscription updates and transactional consistency support shared saved drafts.
- [Convex collaborative ProseMirror example](https://stack.convex.dev/add-a-collaborative-document-editor-to-your-app): incremental editor synchronization is separate from full-document replacement; the example is not proof of Vue/Ginko compatibility.
- [Nuxt rendering modes](https://nuxt.com/docs/4.x/guide/concepts/rendering) and [Nuxt on Vercel](https://vercel.com/docs/frameworks/full-stack/nuxt): ISR and prerendering have different delivery behavior.
- [Prior Ginko architecture review](2026-09-06-architecture-review.md): relevant correctness findings and boundary decisions.

Prepared from source inspection and official documentation, then updated with the local implementation evidence above. The prototype has no hosted deployment and has not completed independent two-user browser verification.

## Architecture deep dive — 15 September 2026

This section is a source-based recommendation, not an implementation or migration approval. It reconciles the prototype with the earlier architecture review and the existing Editor integration candidate. No new behavioral tests or hosted experiments were run for this review.

### Decision

Keep Nuxt, Convex/Better Convex, Ginko Content, the standalone Ginko Editor boundary, and CMS publication safeguards. Refactor the editing model and the presentation of its states. A separate light CMS, generic datastore abstraction, KV draft copy, or universal webpage rich-text editor would add ownership and maintenance costs without addressing the observed friction.

The human model is: a page or article, a selected language, a shared working version, and a published version. Saving is automatic; previewing is a view; publishing is a deliberate action. Translation is a relationship between content variants. Delivery progress is an operation outcome, not another editable content status.

### Ownership to retain

| Owner                   | Responsibility                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Website Vue components  | Layout, visual identity, and which regions are editable                                                              |
| Ginko Content           | Content definitions, portable contract, public queries, route/locale identity, parsing and read rendering            |
| Ginko Editor            | Rich-text document editing, selection, conversion fidelity, undo and explicit flushing of pending editor work        |
| Ginko CMS               | Members, draft sessions, edits, translation review, assets, revision history, publication and delivery orchestration |
| Host deployment adapter | Applying content invalidation to the actual Nuxt/Vercel deployment and accurately reporting its outcome              |

Content can describe localized fields without owning translation approval. Editor can edit German without knowing whether it is a translation or whether it may be published. CMS composes these capabilities.

### Findings that require changes underneath the UI

**1. A page currently implies a rich-text body.** Content injects `bodyMdc` for pages and requires exactly one rich-text body ([builder](/Users/matthias/Git/0_libs/ginko-content/packages/content/src/cms-contract/build.ts:127), [validation](/Users/matthias/Git/0_libs/ginko-content/packages/content/src/cms-contract/build.ts:370)). This explains the unused body editor on the landing page. Provider documents already support structured fields and a null body. Separate website-page eligibility from article-body requirements, retaining existing article defaults. A landing page should have only the fields its Vue template uses. Merely changing to `type: data` is not equivalent: [sitemap tests](/Users/matthias/Git/0_libs/ginko-content/test/contracts/sitemap-query-contracts.test.ts:277) exclude routed data collections. Coordinate the builder, closed validator, portable format, generated contract and CMS assumptions; preserve routes, SEO and locales.

**2. Editor consolidation exists elsewhere, but not in this prototype checkout.** Main CMS `d0e27981` imports its embedded editor ([FieldRichtext](/Users/matthias/Git/0_libs/ginko-cms/packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue:15)). Candidate `fix/parser-parity` at `5aa12170` in `/Users/matthias/.codex/worktrees/ginko-editor-step1/cms` already integrates the standalone Editor and pending-work flushing. Reconcile that candidate instead of implementing another migration. Its recorded tests are not fresh authenticated acceptance evidence. Keep conversion fidelity checks and source-mode fallback for unsupported content.

**3. Save ownership is duplicated.** Studio's [useEntryDraft](/Users/matthias/Git/0_libs/ginko-cms/packages/cms/studio-app/src/composables/internal/useEntryDraft.ts:319) and the prototype's [LandingDraft](/Users/matthias/Git/0_libs/ginko-cms/playground/app/utils/landingDraft.ts:10) each implement local changes, version acknowledgment, saving and conflict behavior. Consolidate those invariants into one CMS-owned draft-session implementation, used independently by both surfaces. It owns identity, remote base, pending local edits, editor handles, serialized writes, permission changes, navigation and disposal. It must flush editor conversion/uploads before persisting and await persistence before preview handoff or publishing. Expose one human save signal without pretending editor emission and server acknowledgment are the same event.

**4. Entry-wide concurrency creates avoidable conflicts.** [Draft writes](/Users/matthias/Git/0_libs/ginko-cms/packages/convex/src/entries/workflow/drafts.ts:85) compare one aggregate version, although shared and locale versions already exist. Two languages can therefore conflict. Introduce checked writes scoped to affected locale/shared data; then field-level edits where simultaneous work in one language justifies them. A field edit needs stable identity, expected base and intended value. The server merges unrelated changes transactionally and rejects overlapping changes. Nested/reordered items need stable IDs. Do not use a shallow client merge or remove concurrency checks. Keep aggregate/hash guards for publication, restoring and operations whose dependencies span the entry.

**5. Translation freshness is a missing domain fact.** [Locale draft rows](/Users/matthias/Git/0_libs/ginko-cms/packages/convex/src/schema.ts:863) do not record an ongoing source-review baseline. Add an optional source-language relationship and the immutable source checkpoint last reviewed. Derive changed fields from that checkpoint; do not infer freshness from save time or equate publication with translation approval. Start with a locale-level baseline and field-level difference display. Add per-field review acknowledgments only if selective review requires them. Review acknowledgment must check the source and target versions. Retain baseline content for diffs; an ID pointing only to mutable current source is insufficient. Existing translations migrate to unknown/unreviewed provenance, not falsely up-to-date. Independent language versions need no forced source relationship.

**6. Site-wide editorial content currently follows a different workflow.** [saveSiteData](/Users/matthias/Git/0_libs/ginko-cms/packages/convex/src/siteData.ts:239) updates the stored data and queues refresh for public blocks without the page draft/publication lifecycle. For a marketer-editable footer, this contradicts the promise that changes stay in the working version until published. Prefer ordinary singleton entries for editorial globals, reusing locale drafts, history, permissions and publication. Keep operational configuration outside the content workflow. Inventory existing site-data readers/keys before any migration, preserve public response contracts and migrate public values into matching published snapshots.

### Website editing and version switching

Use one CMS-owned page session and the same site-owned Vue template for both data channels:

```text
Published Content read ───────┐
                             ├── normalized page data ── Vue page component
Authorized CMS draft read ───┘
```

Do not turn `useContentPage()` into a global mutable draft provider. It currently owns route-based public SSR reads with its own data key ([source](/Users/matthias/Git/0_libs/ginko-content/packages/content/src/runtime/app/composables/use-content-page.ts:93)). Draft reads need separate authorization, state/cache identities and no-store delivery. Lazy-load editing controls only for authorized editing; public rendering should not need the rich-text editor or draft subscriptions.

Proposed user control: **Working version / Live**, a full language name, **Edit**, and **Publish**. Editing is available only for the working version. Preview removes edit controls but continues to show that same working data. Changing a view never creates a revision, publishes, or discards unsaved work. Switching page/language requires the session's flush/save boundary or explicit recovery if it cannot save.

Keep identity separate from URLs. Use entry identity plus exact locale; a draft slug can differ from its published slug, and an unpublished page has no live counterpart. A missing German draft should offer creation, not silently edit English fallback. Reuse Content's existing canonical identity and route alternates for public links.

If the switch displays the latest approved backend snapshot, label it **Published**, not **Live**, until actual website delivery is established. An **Open live website** link visits the real public URL. Display **Updating website…** when the latest approved revision is still being delivered; a private session cannot infer CDN state merely by reading the publication row.

Explicit field bindings are the assistance layer: clicking a headline identifies its entry, locale and field; an image opens media/alt-text controls; a link offers a page/destination chooser; a translation notice opens source changes beside the target. Do not infer field ownership from DOM text. Schema type/localization and a small CMS UI binding API should provide the behavior; the website retains layout control.

The initial page preview can use one entry's draft with published referenced/global content, but it must say so. A full-site working preview must deliberately resolve registered content dependencies through the working channel. Never claim a complete website preview while silently mixing unknown draft and published dependencies. Publishing shared footer or navigation changes must disclose affected pages and locales. A whole-site release/branch system is not required for the initial proof.

### Translation and collaboration behavior

Presence helps people coordinate but does not prevent lost edits. Independent fields/locales should save without interruption. Same-field conflicts should preserve both values and offer a focused comparison. Translation assistance reads a specific source checkpoint and applies results against the expected target version; it must not overwrite newer human edits. Mark **Original text changed**, not **Translation wrong**. A reviewer may confirm the existing translation still fits. Source changes do not automatically remove a live translation.

Current Editor `modelValue` updates are full source replacements, not collaborative operations ([external replacement](/Users/matthias/Git/0_libs/ginko-editor/src/GinkoEditor.vue:701)). Keep MDC as the current article authority and structured JSON for landing fields. If same-paragraph collaboration becomes required, prove a single operation-based rich-text authority, with deterministic MDC/AST snapshots derived at an acknowledged version. Do not keep independently writable Markdown and collaborative JSON in a two-way synchronization loop.

The [Convex ProseMirror component](https://github.com/get-convex/prosemirror-sync) is a candidate experiment: it provides server-authorized step synchronization, but its documented bindings are React-oriented and presence is not included. Vue integration, the actual Ginko schema, conversion fidelity, undo, reconnect and publishing a fully acknowledged revision remain to be demonstrated. Do not introduce another hosting service or migrate all bodies merely to make scalar fields editable.

### Safety to keep; machinery to take out of the user's path

Keep backend membership checks, runtime schema validation, private/public read separation, immutable publication snapshots, explicit locale scope, version-bound review, render safety, and durable delivery retries. [Publication activation](/Users/matthias/Git/0_libs/ginko-cms/packages/convex/src/entries/workflow/publicationCommands.ts:400) already checks the reviewed draft hash and records revision snapshots. [Delivery](/Users/matthias/Git/0_libs/ginko-cms/packages/convex/src/revalidation/worker.ts:123) already rejects stale acknowledgments through generation/lease checks. These protections make a low-friction interface possible.

Derive UI messages from canonical facts: pending local work, acknowledged content versions, publication pointers, reviewed source checkpoint and delivery evidence. Do not persist a single manually maintained mega-status or create another database table for UI badges. Healthy state stays quiet. Show an actionable error where work is blocked; technical job detail belongs in the agency's diagnostics.

Keep public parse-at-publication and cached delivery. [Vercel documents Nuxt ISR and on-demand regeneration](https://vercel.com/docs/incremental-static-regeneration/quickstart), but a webhook HTTP success alone does not prove that visitors receive the desired HTML and client-navigation payloads. Finish the adapter experiment with duplicate/out-of-order delivery, failed regeneration, redirects, locale routes and new/removed listings. Reuse the existing outbox rather than add a KV content copy or another scheduler. Static export remains a separate delivery mode requiring builds.

### Refactoring sequence and exit conditions

1. **Reconcile existing work.** Review the shared Editor candidate against main/PoC; verify real text and pending media through save, reload, locale changes and navigation. No duplicate extraction.
2. **One CMS session.** Move both Studio and website consumers onto the same save/flush/conflict lifecycle; then remove duplicate prototype state. Prove query/mutation order, failure, revocation and disposal behavior.
3. **Narrow concurrent edits.** Preserve existing public write contracts during a controlled migration. Prove concurrent languages, unrelated fields, overlapping fields, shared-field dependencies and stale publication review. Track any temporary adapter and its exact removal condition in `internals/migrations.md` if implemented.
4. **Translation provenance and focused UI.** Add the optional baseline model, then implement one language picker and source-difference review. Prove source changes during review and independently authored languages.
5. **Structured page contract.** Coordinate Content/CMS compatibility for pages without article bodies. Preserve existing defaults, URLs, sitemap, export/import and nonempty existing content. Do not change data-collection semantics as a shortcut.
6. **Uniform editorial globals and delivery.** Inventory and migrate any applicable site data, with published-output parity and rollback. Prove a real Vercel deployment before advertising immediate hosted delivery.
7. **Rich-text collaboration experiment.** Keep separate from the above migrations; adopt only after its actual document/selection/persistence/publication behavior is demonstrated.

Some UI simplification can happen earlier, but do not remove recovery controls before the shared session supplies their safety. Existing package consumers and persisted data rule out an assumed greenfield hard cutover. No new tenant platform, backend abstraction or generalized plugin system is warranted by this review.

## Active implementation checkpoint — 22 September 2026

This copy in `/Users/matthias/.codex/worktrees/ginko-cms-experience/cms` is the authoritative execution record for the activated goal. The original main checkout and its uncommitted prototype are preserved.

### Integration decisions

- CMS base: rollout `0d8ea2d`, with six reconciled standalone Editor commits from `fix/parser-parity`. No shared branch was reset or merged.
- Content worktree: `../content`, based on `0581367`; explicit `body: false` routed structured pages. Existing articles retain MDC bodies and old contract hashes.
- Editor worktree: `../editor`, based on `b834ddf`, now at `0a8c12c` for canonical managed-image controls under an explicit host policy. Current Editor needs Content beta.9 parser/authoring APIs missing from rollout beta.8.
- Candidate archives and their exact hashes are recorded in `packages/cms/compatibility.json` with local-source-candidate-only status. They are not approved registry releases.
- One `EntryDraftSession` owns save sequencing, local intent, remote merges, retries and conflict recovery for Studio and website. Backend field comparison remains authoritative; publication retains aggregate version and operation confirmation fences.
- New append-only translation review checkpoints preserve unknown provenance and bind both locale draft identities, versions and shared version.
- Vercel delivery reuses Content's signed invalidation endpoint and CMS outbox. Actual hosted CDN evidence remains a later approval gate.
- The application handbook references in user instructions are unavailable on disk; available CMS repository instructions govern the implementation.

### Current acceptance status

- Content is clean at `f8942a2`, with its full verification passing: 1,419 core/contract/runtime tests, 15 production-server tests, typechecks and maintained example/documentation builds. The final archive is installed and pinned by hash. Editor is clean at `0a8c12c`, with 270 tests, type checking, lint and build passing.
- Real two-user Studio/website text synchronization, automatic save acknowledgments, field/locale switching, translation review and stale-review recovery passed in the browser. Desktop and 390px Studio checks passed. See the detailed browser checkpoint below. The final media/publication journey also passed after the integration fixes, as recorded below.
- Fresh local owner, publisher, editor and non-member identities use normal signup, verification and invitations. Anonymous/non-member operations and a revoked publisher were denied. Preview HTML is private/no-store/noindex and contains no draft text for anonymous visitors. Final-code authorization checks were repeated successfully through normal sign-in and membership removal/restoration.
- The newer rollout and Editor integration are reconciled. Shared draft sessions, exact retry and locale identity fences, structured pages, source-review provenance, and the delivery adapter are implemented. Focused tests cover migrations/rollback, public image transport, source/target review fences and inherited public-cache settings.
- All three local contract transitions passed the normal reviewed workflow. The image-policy transition scanned, staged, validated and applied both entries with zero authored-content changes. No hosted deployment or publication occurred.
- Final CMS `release:verify` passed 1,490 tests (one intentionally skipped), packed-consumer checks including a production Nitro build and Content V2 safety probes, and the production audit with zero findings. The final media changes are included. An additional ten candidate-provenance tests passed after the last release-script edits, including missing/tampered Editor evidence. The first final run failed only an old literal copy assertion; that assertion was corrected and the complete gate reran successfully.
- A final independent review checked authorization, field merging, locale replacement, publication snapshots, translation fences and public transport. It found a source-selection metadata race during pending autosave; the panel now preserves the relationship version the user acted on, with two behavioral regression tests. Package-test cleanup now preserves pinned upstream archives and removes only its own outputs, verified against real temporary files.

### Local review environment

Target Nuxt URL is `http://localhost:3410`, isolated Convex API `127.0.0.1:3421`, HTTP `127.0.0.1:3422`, Studio Vite `localhost:5262`, local mail inbox `127.0.0.1:5261`. The existing machine-trusted development CA signs the loopback storage endpoint at `https://localhost:3443`; no certificate trust setting or production HTTPS policy was weakened. The same local database runs under an explicitly checked self-hosted loopback authority. Do not reuse the older prototype's environment or data.

From this integration worktree, `corepack pnpm run dev:consumer` starts the prepared local stack. Credentials and certificate keys remain only in ignored owner-readable files. The full preview is stopped only while checks regenerate Nuxt output; its backend-only process remains available for those checks. The normal full stack will be left running at handoff.

### Studio browser checkpoint — 22 September, 12:32 local

Verified with real Alex owner authentication in the in-app browser and a separately authenticated Romi publisher in Chrome, against the disposable runtime above. Browser actions used the real forms, editor, picker and preview controls. These observations describe local acceptance only.

- **Two-user shared working version passed without reload.** Alex changed the English landing introduction in Studio to “A place we shape together, from the first idea to the next season.” and observed the automatic saved acknowledgement. Romi's already-open website received it. Romi changed the website headline to “A living world, made together.”; Alex's already-open Studio received it and showed saved. The independent CTA destination change also arrived in Studio.
- **Article text and navigation passed.** A new body paragraph survived clicking Preview immediately after a visual edit. Preview waited for pending work, then displayed the text. Markdown/Visual switching retained the intended article. Returning to Studio preserved the saved body. Editing the German introduction and immediately switching to English flushed the German change; fresh German navigation showed that exact value while its original body remained separate from English.
- **Article media persistence passed; rendered media preview was still blocked at this checkpoint.** Add image → Browse images → `canopy.png` inserted the synthetic asset and its English alternative text. After immediate Preview and return, Studio still displayed the saved image and text. German contained neither the English image nor new paragraph. The public-rendering draft preview reported “Draft preview unavailable” with the image present; the delivery owner is investigating. Do not count media preview acceptance until this is fixed and rechecked.
- **Translation review passed in the real UI.** German began with unknown provenance. Alex selected English as its source and acknowledged the baseline without editing German content. An English website opening-line change made the existing German Studio review require attention without a reload. The review showed only the changed opening line, with previous source, current source and German text. A second source edit while that review was open removed the confirmation action, showed the stale-review warning, and offered review of the latest text. Restarting showed the new source; acknowledging unchanged German returned to reviewed status and cleared the warning. German content remained unchanged throughout.
- **Desktop and narrow interface passed.** Inspected 1280×720 and 390×844, including long German headings/introduction, localized field names, the compact save/Preview/Publish bar, contextual translation details, and scrolling source/target review text. Keyboard Tab/Enter opens review; Escape closes the narrow details sheet and restores focus to the named translation action. Temporary viewport overrides were reset.
- **Browser-found defects fixed and rechecked.** Field-label language maps were ignored by the old string-only helper; German Studio now displays Überschrift, Einleitung, Auftakt, Buttontext, Linkziel, Seitenbild and Bildbeschreibung while editing English content. Narrow header expanded state now reflects the actual sheet. Pending locale loads no longer report existing languages as missing. The removed duplicate workflow/status dashboards remain available under contextual history and website-delivery details. Field-specific conflict recovery preserves both values and uses the same localized label helper.
- **Focused verification.** The original Studio UX set passed 117 behavioral/shared tests in seven files; localized labels added a rendered reactive label test plus helper fallbacks (65 tests passed with the existing workflow suite); the pending-label/conflict follow-up passed its focused ten tests. Changed Studio source/test files passed lint. These are not a substitute for the coordinator's final integrated checks. Screenshots were inspected through the browser tool; no screenshot file artifact is claimed.

#### Final browser continuation limitation

The original in-app browser became unavailable after the integration rebuild. A separate normal-profile Chrome tab opened the canonical Studio service on `http://localhost:3410` and reached the real sign-in form. During Alex sign-in, Chrome's browser provider detached and then reported that another extension UI was blocking automation. The agent stopped rather than changing extension settings or bypassing the restriction. The earlier two-user, Studio layout, article persistence and translation proofs above remain valid observations; final article image rendering/publication and website narrow checks are handed to the coordinator's existing authenticated Incognito surface. Do not count the interrupted normal-profile login or final image preview as passed based on this attempt. Port 3443 is the storage TLS proxy, not the Studio entry point.

### Final integration walkthrough — 22 September, 13:40 local

- `release:verify` passed on patched dependencies: 1,479 tests passed, one intentionally skipped, packaged Nuxt consumer and safety probes passed, production audit reported zero vulnerabilities. The additional package-cleanup filesystem regression and final Studio typecheck also passed. Pinned upstream archives survived the package gate unchanged.
- Real authentication was repeated through normal sign-in: owner, publisher, editor and verified non-member roles matched. Anonymous/non-member reads and writes failed. Removing the publisher invalidated protected operations for its existing JWT; normal invitation acceptance restored access. A fresh TLS upload completed claim and verified finalization with localized metadata.
- In the existing Romi Incognito session, the English landing preview rendered the saved canopy image and custom alternative text. Normal Publish review activated English. Anonymous `/landing/home` changed from 404 to 200 with the approved title and HTTPS image, without a frontend rebuild. `/de/landing/home` stayed 404.
- Romi changed the working headline to `A living world, made together. Our next chapter.` and immediately selected Published. The switch waited for saving and showed the earlier approved headline. Returning to Working showed the acknowledged newer headline. Anonymous public HTML, preview HTML and a guessed preview payload contained no `Our next chapter.` canary; private preview HTML carried `private, no-store` and `noindex, nofollow`.
- The actual website was inspected at 390×844 using Chrome's responsive viewport controls. Toolbar groups wrapped within the viewport; the long headline and German content remained readable. Keyboard language selection changed the exact `locale` query to German. Tab/Return selected Published with a visible focus ring and the explicit “German is not published yet” state. Desktop viewport was restored afterward.
- The final article check exposed an installed-policy mismatch: stored dimensions allowed numbers only, while the current source accepts both strings and numbers emitted by MDC. The normal reviewed transition completed (`kh772sxk6e9gae65yad1sn4yhs8ew8rt`, two entries scanned, zero authored-content changes). Exact backups and normal draft/publication operations preserved the earlier approved landing, its newer private working title, both German variants, and the article body. No content-policy guard was weakened.
- After that transition, the article preview rendered its image and complete body. A Markdown heading edit followed immediately by Preview waited for saving and displayed the corrected heading. German remained separate. Normal Studio publication activated English; anonymous `/blog/a-garden-for-everyone` returned 200 with the heading, image and final paragraph, `/blog` listed the article, and the German article remained 404. No frontend rebuild occurred between publication and those reads.
- Final dialog inspection confirmed full language names, an explicit future page address, no published-page link for unpublished German, and collapsed delivery details. The misleading no-change readiness warning was fixed and rechecked in the native browser. Loading is neutral and no future route is shown until selected-language impact is available; focused tests cover the transient wrong-language regression.
- Studio image reload passed after the final fixes. Read-only native DOM inspection had shown canonical media props but no rendered `src`. Nuxt runtime configuration was transforming nested nulls in the host authoring policy; that contract now crosses the runtime boundary as atomic JSON. The stable asset provider now signals late URL changes without replacing Editor or cancelling uploads. Editor recognizes only the exact supported managed-image shape; custom, restricted, ID-less and mismatched-ID image blocks retain their component identity.
- On the restarted final build, a full Studio reload displayed the actual canopy image. Its native Image settings control saved the new working-only description “Overlapping green canopies, growing together.” Website Preview rendered that description and the full article. Returning through a fresh Studio page load, then Markdown → Visual, retained the actual image, complete body, stable ID/src, filename, title and dimensions. The earlier public article was not republished, giving a second working-only privacy canary.
- Editor `0a8c12c` passed 270 tests, type checking, lint and build. CMS media integration passed 39 focused tests, including the actual stored MDC and late kit/URL arrival without unintended body writes. Independent media review found and fixed the ID-less component-identity edge case. The final whole-repository gate subsequently passed; the exact-playground production proof is recorded in the final verification section.

## Return review

### Open the local experience

- [Landing working version](http://localhost:3410/preview/landing/m17b5acf1p1j5wqtebyxwn24z18ex4d1?locale=en) — website editing, Working/Published switch, language and publication controls.
- [Landing in Studio](http://localhost:3410/studio/content/landing/m17b5acf1p1j5wqtebyxwn24z18ex4d1?locale=en) — the same shared working fields.
- [Article in Studio](http://localhost:3410/studio/content/blog/m1751rfgjvmr1s5p3vvhwdxghx8ex3w8?locale=en) and [article preview](http://localhost:3410/preview/blog/m1751rfgjvmr1s5p3vvhwdxghx8ex3w8?locale=en).
- [Published landing](http://localhost:3410/landing/home) and [published article](http://localhost:3410/blog/a-garden-for-everyone) — anonymous approved output. German remains unpublished.

Romi's publisher session is already signed in in the Chrome Incognito review window. Local owner/publisher/editor/non-member credentials remain in ignored owner-readable files in this worktree; none are committed here. The environment and normal invitation workflow are documented in [local Studio development](../docs/maintenance/local-studio-development.md).

Restart the prepared stack from `/Users/matthias/.codex/worktrees/ginko-cms-experience/cms` with one command:

```sh
corepack pnpm run dev:consumer
```

The work is isolated in `cms` (`codex/cms-experience`), `content` (`codex/structured-pages`, `f8942a2`) and `editor` (`codex/cms-experience-editor`, `0a8c12c`) under `/Users/matthias/.codex/worktrees/ginko-cms-experience`. The original CMS main, newer rollout and earlier Editor integration checkouts were preserved. Exact dependency artifact identities are in `packages/cms/compatibility.json`; the source candidates are not registry releases.

### Short product review

1. Change the landing headline on the website. Check Studio receives it, then switch Working/Published and confirm the approved headline stays separate.
2. Switch to German and open Translation review. Judge whether the changed-source comparison and the option to keep a suitable translation make sense without explanation.
3. Edit the article, preview it, and inspect the compact publication review. Judge the language labels, quiet saving feedback and discoverability of details/history.

### Migration and limits

Use the existing reviewed contract transition workflow; do not deploy an older contract over newer stored content. The local transitions preserved exact before/after snapshots and authored values. Structured-page rollback restores the previous body contract through an inverse transition; the existing requirement to unpublish affected entries still applies. Details and compatibility removal conditions are in [active migrations](../internals/migrations.md).

- This is shared field-level editing. Overlapping rich-text bodies require explicit recovery; same-paragraph character merging is not implemented.
- Protected draft queries enforce membership. Raw storage URLs are capability links and do not independently require a Studio session.
- Translation history preserves immutable baselines. Permanent deletion still fails closed beyond the existing 40-review-record atomic envelope.
- This pilot does not migrate site-data globals or add an editable footer. The host-owned decorative footer remains ordinary template code.
- Hosted Vercel/CDN verification, registry-byte certification, package publication and external rollout remain separate approval gates. Local server-rendered publication without rebuild is proven; fully prerendered files still need regeneration/rebuild.

Ignored `.tmp/experience` evidence records the synthetic identities, reviewed transitions, authorization/revocation checks and anonymous HTTP assertions. These local diagnostics may contain test credentials; they are not release artifacts and must not be published. The committed workstream records conclusions without secrets.

### Final verification record

- Final `corepack pnpm run release:verify`: exit 0; 215 test files and 1,490 tests passed, one intentionally skipped; packed pnpm consumer, production Nitro build, import/MCP/Content V2 safety probes and production dependency audit passed. Log: `/tmp/ginko-experience-release-verify-accepted.log`.
- Earlier final run: 1,488 tests passed; one assertion still expected the replaced publish-dialog sentence. Corrected the test to the reviewed copy and reran the full gate above. Log: `/tmp/ginko-experience-release-verify-integrated.log`.
- Candidate provenance: ten focused tests, ESLint, YAML parsing and script syntax checks passed after adding Editor to the existing artifact verification/download path. No consumer Editor dependency or certification bypass was added.
- Content `f8942a2`: full verification, 1,419 core/contract/runtime tests, 15 production-server tests, types and maintained example/docs builds passed. Editor `0a8c12c`: 270 tests, types, lint and build passed.
- Actual production playground HTTP/bundle and no-rebuild publication checks passed as recorded below; no hosted Vercel claim is made.

- **Initial static production baseline (superseded by the runtime publication proof below).** `pnpm run dev:build` built the real host with its approved published content, including 16 prerendered routes. Its generated Node server ran independently on `127.0.0.1:3567`, with `.env.local` loaded privately and the existing local backend/TLS endpoints. `node .tmp/experience/inspect-production-http.mjs` passed seven requests: English landing, article and blog list returned 200; unpublished German landing/article returned 404; anonymous landing/article previews returned only the private loading shell with `Cache-Control: private, no-store` and noindex headers/meta. Neither working-only title nor image-description canary appeared; the public article retained its approved description and complete body. `node .tmp/experience/inspect-public-bundles.mjs` checked the generated production dependency graph: public landing (21 chunks), blog list (17) and article (24) contain no draft-query/save/session or rich-text Editor implementation; the private preview (26) positively contains its draft APIs. Actual initial scripts/preloads contain no Studio assets. A private CSS filename in the shared lazy-import map is a reference, not a loaded editor component; normal BetterConvex auth/client dependencies remain allowed. This establishes static dependency and initial HTML evidence, not a browser network capture. Build/probe logs and JSON results are under `.tmp/experience/production-{build,bundle-inspection,http-inspection}.log`, `production-bundle-evidence.json` and `production-http-evidence.json`. The isolated server stopped cleanly after verification. These are local production-build results; they do not prove hosted Vercel/CDN invalidation or updates to already-prerendered files without regeneration.

- Actual browser upload passed through the native file chooser: `canopy.png` finalized as `jx74x0y2x2s2cd46gmbztpsed18exekh`. Preview was clicked while the editor reported conversion work; it waited, then rendered the new image and complete article. Returning to Studio retained its stable reference. The temporary duplicate image was removed from the working article through normal Markdown editing; the earlier body and working-only description were restored and acknowledged. The unused synthetic upload remains in the local media library. Ordinary keyboard copy/paste in Markdown was also verified.
- Final production review found that Content's default delivery setup had prerendered the public pages, their payloads and query JSON. The first production checks prove rendering/privacy/bundle separation, but do not prove updates after publication. The dynamic SSR configuration and publish/restore proof below resolve this gap; the earlier static build is not accepted as no-rebuild evidence.

- **Production publication without rebuilding passed on the explicit SSR profile.** The initial build exposed a real gap: Content's default discovery crawl emitted public HTML, query JSON and Nuxt payload files; the documented agent `runtime` mode removes only HTML. The playground and Vercel host guide now select native Nitro `prerender: { crawlLinks: false, ignore: ['/api/_content'] }`, with no Content/provider default changes or weaker private guards. A fresh `pnpm run dev:build` passed; filesystem assertions found no CMS page HTML, query JSON or extracted payload artifacts. On one unchanged Node server at `127.0.0.1:3567`, `node .tmp/experience/prove-runtime-publication.mjs` warmed landing/article/list HTML and the exact query URLs emitted by those responses. Normal guarded publication previews and confirmation tokens then activated temporary English title markers from the approved snapshots. Across four phases (before publication, after publication, restored private working edits, restored approved publication), all 12 HTML responses and their inline Nuxt data, all 12 requests to the identical original query URLs, and all 12 extracted-payload requests behaved correctly. Extracted payloads consistently returned 404 because SSR embeds current data; no static payload was fetched. The compiled server/chunk checksum stayed identical throughout, with no rebuild or restart. Fresh protected backups and final deep comparisons confirm exact approved locale content/routes and all English/German working values restored, including both private canaries; German remained unpublished. The seven private/public HTTP checks and bundle closure checks also passed on this dynamic build. Evidence: `.tmp/experience/runtime-production-build.log`, `runtime-publication-proof.log`, `runtime-publication-evidence.json`, `runtime-production-http-inspection.log` and `runtime-production-bundle-inspection.log`; backups are ignored owner-readable diagnostics. The normal Content warning about disabled crawling is intentional for this CMS SSR profile. Hosted Vercel ISR/CDN behavior remains an external approval gate.
