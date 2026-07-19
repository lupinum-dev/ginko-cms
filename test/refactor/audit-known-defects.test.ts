import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

function source(file: string) {
  return readFileSync(resolve(root, file), 'utf8')
}

function section(contents: string, start: string, end?: string) {
  const startIndex = contents.indexOf(start)
  expect(startIndex, `Missing start marker: ${start}`).toBeGreaterThanOrEqual(0)
  const endIndex = end ? contents.indexOf(end, startIndex + start.length) : contents.length
  expect(endIndex, `Missing end marker: ${end}`).toBeGreaterThan(startIndex)
  return contents.slice(startIndex, endIndex)
}

/**
 * Executable contracts for confirmed audit findings.
 *
 * These source-level drift guards complement the executed behavior and
 * query-count regressions; they are not substitutes for those tests.
 */
describe('known audit defects', () => {
  it('[QUA-01] keeps narrow editor controls named and saved-state text AA-readable', () => {
    const toolbar = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioEntryCompareToolbar.vue',
    )
    const sharedFields = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioSharedFieldsPanel.vue',
    )
    const parentPicker = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioEntryParentPicker.vue',
    )
    const topBar = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioEntryTopBar.vue',
    )
    const detailsPanel = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioEntryDetailsPanel.vue',
    )
    const statusRail = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioEntryStatusRail.vue',
    )

    expect(toolbar).toContain('aria-label="Single language view"')
    expect(toolbar).toContain('Select language. Current ${currentLocaleLabel}')
    expect(sharedFields).toContain(':aria-label="editor.loader.t(')
    expect(parentPicker).toContain(':aria-label="t(\'ginkoCms.studio.collectionEditor.parent\')"')
    expect(topBar).not.toContain("return 'ginko:text-muted-foreground/80'")
    expect(detailsPanel).not.toMatch(/text-muted-foreground\/(?:60|70|80)/)
    expect(statusRail).not.toMatch(/text-muted-foreground\/(?:60|70|80)/)
    expect(statusRail).toContain(
      'ginko:font-mono ginko:text-xs ginko:font-semibold ginko:text-foreground',
    )
  })

  it('reads an entry draft public projection through the existing entry index', () => {
    const body = section(
      source('packages/convex/src/entries/context.ts'),
      'export async function readStudioDraftView(',
      'async function publishedSnapshotsForRows(',
    )

    expect(body).toContain(".withIndex('by_entry_locale'")
  })

  it('reads version publication state from canonical active revision pointers', () => {
    const body = section(
      source('packages/convex/src/entries/history.ts'),
      'export const listVersions =',
    )

    expect(body).toContain('entry.activePublications')
    expect(body).not.toContain("query('publicEntries')")
  })

  it('bounds destructive descendant previews through the structural parent index', () => {
    const body = section(
      source('packages/convex/src/entries/destructivePreview.ts'),
      'async function readPublicDescendantRoutes(',
    )

    expect(body).toContain('MAX_PUBLIC_DESCENDANT_ROUTE_PREVIEW')
    expect(body).toContain(".withIndex('by_collection_locale_parent_orderKey'")
    expect(body).toContain('.take(perParentReadLimit)')
    expect(body).not.toContain('.collect()')
  })

  it('checks draft path ownership through canonical siblings and explicit move-ins', () => {
    const body = source('packages/convex/src/entries/draftPathConflicts.ts')
    expect(body).toContain(".withIndex('by_parent'")
    expect(body).toContain("q.eq('collection', args.collection.slug)")
    expect(body).toContain('readDraftPlacementRows')
    expect(body).not.toContain("q.field('collectionId')")
    expect(body).not.toContain(".withIndex('by_parent_override'")
    expect(body).not.toContain("query('publicEntries')")
    expect(body).not.toContain('readStudioDraftView')
    expect(body).not.toContain("from './context.js'")
    expect(body).toContain('effectiveDraftParent')
    expect(body).toContain('effectiveDraftSlug')
  })

  it('uses the shared indexed sibling validator for reparenting', () => {
    const body = source('packages/convex/src/entries/tree.ts')
    expect(body).toContain('assertNoDraftSiblingPathConflict(ctx')
    expect(body).not.toContain(".withIndex('by_collection_status'")
  })

  it('loads a site-data deletion target through the existing key index', () => {
    const body = section(
      source('packages/convex/src/siteData.ts'),
      'export const deleteSiteDataBlockOperation =',
      'export const deleteSiteDataBlockOperationExecute =',
    )

    expect(body).toContain(".withIndex('by_key'")
  })

  it('keeps asset reference reads bounded and resolves page metadata in parallel', () => {
    const sourceBody = source('packages/convex/src/assets/relationships.ts')
    const usageBody = section(
      source('packages/convex/src/assets/relationships.ts'),
      'export async function mapAssetReferenceUsages(',
      'export async function hasAssetReferences(',
    )
    const existenceBody = section(
      sourceBody,
      'export async function hasAssetReferences(',
      'export async function readAssetReferenceFlags(',
    )

    expect(sourceBody).not.toContain('.collect()')
    expect(usageBody).not.toMatch(
      /for \(const row of rows\)[\s\S]*await resolveEntryMetaForAssetRef/,
    )
    expect(usageBody).not.toContain('readStudioDraftView')
    expect(usageBody).toContain('resolveEntryMetadata')
    expect(existenceBody).toContain('.first()')
  })

  it('keeps the asset-browser orchestration seam within the reviewed shell budget', () => {
    const lines = source(
      'packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext.ts',
    ).split('\n').length

    expect(lines).toBeLessThanOrEqual(480)
  })

  it('drives every Studio collection surface from the installed contract', () => {
    const surfaces = [
      'packages/cms/studio-app/src/components/CmsCommandPalette.vue',
      'packages/cms/studio-app/src/components/studio/StudioHeader.vue',
      'packages/cms/studio-app/src/components/studio/StudioSidebarNav.vue',
      'packages/cms/studio-app/src/composables/internal/useEntryLoader.ts',
      'packages/cms/studio-app/src/composables/internal/useStudioCollectionsAdmin.ts',
      'packages/cms/studio-app/src/pages/[collection]/index.vue',
      'packages/cms/studio-app/src/pages/[collection]/new.vue',
      'packages/cms/studio-app/src/pages/index.vue',
    ]

    for (const file of surfaces) {
      const body = source(file)
      expect(body, file).not.toContain('codeDefinedCollection')
      expect(body, file).not.toMatch(/(?:cmsConfig|config)\.collections/)
      expect(body, file).not.toContain('host-config-fallback')
    }

    const localeState = source('packages/cms/studio-app/src/composables/useCmsStudioSettings.ts')
    expect(localeState).not.toContain('useCmsConfig')
    expect(localeState).not.toMatch(/config\.(?:locales|defaultLocale)/)
  })

  it('fails closed on draft creation while the installed contract is incompatible', () => {
    const createPage = source('packages/cms/studio-app/src/pages/[collection]/new.vue')

    expect(createPage).toContain('useCmsContractCompatibility()')
    expect(createPage).toContain('contract.compatibility.value?.writable === true')
    expect(createPage).toContain('if (!contractWritable.value) return')
    expect(createPage).toContain(':saving="saving || !contractWritable"')
  })

  it('[ADM-04] keeps model, site-data, and browser-local appearance settings visible to every CMS reader', () => {
    const navigation = source('packages/cms/studio-app/src/lib/studioNavigation.ts')
    const routeBlock = (id: string) =>
      navigation.match(new RegExp(`id: '${id}'[\\s\\S]*?\\n  },`))?.[0] ?? ''

    expect(routeBlock('collections')).not.toContain('requiredCapability')
    expect(routeBlock('siteData')).not.toContain('requiredCapability')
    expect(routeBlock('agents')).not.toContain('requiredCapability')
    expect(routeBlock('settings')).not.toContain('requiredCapability')
  })

  it('[NAV-03] uses one authorized draft-search path for the Studio command palette', () => {
    const search = source('packages/cms/studio-app/src/composables/useStudioSearch.ts')

    expect(search).toContain('api.ginkoCms.collections.searchStudioEntries')
    expect(search).not.toContain('api.ginkoCms.public.search')
    expect(search.match(/useConvexQuery\(/g)).toHaveLength(1)
  })

  it('[NAV-02] keeps primary navigation and routable Studio areas on one canonical inventory', () => {
    const navigation = source('packages/cms/studio-app/src/lib/studioNavigation.ts')
    const router = source('packages/cms/studio-app/src/router.ts')
    const sidebar = source('packages/cms/studio-app/src/components/studio/StudioSidebarNav.vue')
    const palette = source('packages/cms/studio-app/src/components/CmsCommandPalette.vue')

    for (const [id, path] of [
      ['home', '/'],
      ['siteData', '/site-data'],
      ['assets', '/assets'],
      ['reviews', '/reviews'],
      ['collections', '/model'],
      ['activity', '/activity'],
      ['agents', '/agents'],
      ['settings', '/settings'],
    ]) {
      expect(navigation, id).toContain(`id: '${id}'`)
      expect(router, path).toContain(`path: '${path}'`)
    }
    expect(sidebar).toContain('studioRoutesForSection')
    expect(palette).toContain('studioStaticRoutes')
    expect(navigation).not.toContain("id: 'imports'")
  })

  it('[NAV-05] reloads entry and locale state from reactive backend queries after navigation', () => {
    const loader = source('packages/cms/studio-app/src/composables/internal/useEntryLoader.ts')

    expect(loader).toContain('const entryId = computed(() => String(route.params.id))')
    expect(loader).toContain("typeof route.query.locale === 'string'")
    expect(loader).toContain('computed(() => ({ id: entryId.value, locale: routeLocale.value }))')
    expect(loader).toContain('() => [route.params.id, route.query.locale]')
    expect(loader).toContain('initialized.value = false')
    expect(loader).not.toMatch(/(?:local|session)Storage.*(?:draft|entry)/)
  })

  it('[EDT-04] keeps pending and failed draft work guarded until backend save success', () => {
    const draft = source('packages/cms/studio-app/src/composables/internal/useEntryDraft.ts')
    const routeGuard = section(draft, 'onBeforeRouteLeave(', 'const offlineRetry')
    const browserGuard = section(
      draft,
      'const beforeUnloadHandler = (event: BeforeUnloadEvent) => {',
      'const keyboardSaveHandler = (event: KeyboardEvent) => {',
    )
    const saveResult = section(draft, 'async function handleSaveDraft(', 'return {')

    expect(routeGuard).toContain('if (isDirty.value && canEditEntries.value)')
    expect(routeGuard).not.toContain('!saving.value')
    expect(routeGuard).toContain('next(answer ? undefined : false)')
    expect(browserGuard).toContain('if (isDirty.value)')
    expect(browserGuard).toContain('event.preventDefault()')
    expect(saveResult).toContain('const succeeded = await saveQueue.enqueue({ silent })')
    expect(saveResult).toContain('if (succeeded)')
    expect(saveResult).toContain('isDirty.value = false')
  })

  it('[IMP-04] keeps database snapshots, content portability, and asset-only recovery as explicit non-interchangeable boundaries', () => {
    const recovery = source('docs/maintenance/backup-and-recovery.md')

    expect(recovery).toContain('no application-level database backup or full-table')
    expect(recovery).toContain('Official Convex Backup & Restore')
    expect(recovery).toContain('Owner-only `ginko-cms content` commands')
    expect(recovery).toContain('Verified asset recovery artifact')
    expect(recovery).toMatch(/A content\s+export is not a deployment snapshot/)
    expect(recovery).toMatch(/reproduce\s+the original bytes exactly/)
    expect(recovery).toContain('does not overwrite an existing asset')
  })

  it('[DAT-02] explains immediate public site-data impact without pretending exact page dependency knowledge', () => {
    const page = source('packages/cms/studio-app/src/pages/site-data.vue')
    const admin = source(
      'packages/cms/studio-app/src/composables/internal/useStudioSiteDataAdmin.ts',
    )
    const copy = source('packages/cms/src/public/locales/en.ts')

    expect(page).toContain('publicSaveImpactTitle')
    expect(page).toContain('publicSaveImpactDescription')
    expect(page).toContain("block.visibility === 'public'")
    expect(admin).toContain('saveSuccessPublic')
    expect(admin).toContain('saveSuccessPrivate')
    expect(copy).toContain('requests a broad website refresh')
    expect(copy).toContain('Exact page usage is not tracked')
  })

  it('[COL-04] keeps frequent saves and outcomes in accessible page state without duplicate toast paths', () => {
    const topBar = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioEntryTopBar.vue',
    )
    const outcome = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioPublishOutcomeCard.vue',
    )
    const notice = source('packages/cms/studio-app/src/components/ui/alert/Alert.vue')
    const highFrequencySurfaces = [
      'packages/cms/studio-app/src/composables/internal/useEntryDraft.ts',
      'packages/cms/studio-app/src/composables/internal/useEntryPublishing.ts',
      'packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext.ts',
      'packages/cms/studio-app/src/pages/reviews.vue',
    ]

    expect(topBar).toContain('studio-entry-topbar__save-indicator')
    expect(topBar).toContain('role="status"')
    expect(topBar).toContain('aria-live="polite"')
    expect(outcome).toContain('role="status"')
    expect(outcome).toContain('aria-atomic="true"')
    expect(notice).toContain('role="alert"')
    for (const file of highFrequencySurfaces) {
      expect(source(file), file).not.toMatch(/(?:useToast|toast\(|from ['"][^'"]*toast)/i)
    }
  })

  it('loads tree parents lazily and exposes no unbounded listEntries API', () => {
    const parentPicker = source(
      'packages/cms/studio-app/src/components/studio/editor/StudioEntryParentPicker.vue',
    )
    const editorSchema = source('packages/contract/src/schemas/editor.ts')
    const editorBackend = source('packages/convex/src/entries/studioInventory.ts')

    expect(parentPicker).toContain('useCmsStudioPaginatedQuery')
    expect(parentPicker).toContain('listEntriesForStudio')
    expect(parentPicker).toContain('initialNumItems: 30')
    expect(editorSchema).not.toMatch(/export const listEntries\s*=/)
    expect(editorBackend).not.toMatch(/export const listEntries\s*=/)
  })
})
