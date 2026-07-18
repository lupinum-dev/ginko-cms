// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useEntryPublishing } from '../../packages/cms/studio-app/src/composables/internal/useEntryPublishing'
import { useStudioConfirmState } from '../../packages/cms/studio-app/src/composables/internal/useStudioConfirm'
import { useStudioPromptState } from '../../packages/cms/studio-app/src/composables/internal/useStudioPrompt'

// useConvexMutation is called once per operation in declaration order:
// publish, unpublish, archive, restore, permanent delete. Track the created
// mocks by index.
const { mutationFns, previewMutation } = vi.hoisted(() => ({
  mutationFns: [] as Array<ReturnType<typeof vi.fn>>,
  previewMutation: vi.fn(),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => {
    const fn = vi.fn(() =>
      Promise.resolve({
        status: 'applied',
        value: { dirtyLocales: [], draftVersion: 6, versionId: 'v-1' },
      }),
    )
    mutationFns.push(fn)
    return fn
  },
}))

vi.mock('../../packages/cms/studio-app/src/boundary/studio-host-context', () => ({
  useStudioHostContext: () => ({
    requireConvexClient: () => ({ mutation: previewMutation }),
  }),
}))

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    entry: ref({ baseSlug: 'hello-world', draftVersion: 7 }),
    entryId: ref('entry-1'),
    collection: ref('posts'),
    contentRoute: '/studio/content',
    router: {},
    fields: ref([]),
    localeVariants: ref([{ locale: 'en' }]),
    currentLocale: ref('en'),
    canPublishEntries: ref(true),
    canArchiveEntries: ref(true),
    canDeleteEntries: ref(true),
    saving: ref(false),
    error: ref(''),
    isDirty: ref(false),
    form: { slug: 'hello-world' },
    handleSaveDraft: vi.fn(async () => true),
    buildSharedData: () => undefined,
    buildLocalizedData: () => undefined,
    dataFields: {},
    studioDebug: { debug: vi.fn(), error: vi.fn(), pushWithLogging: vi.fn() },
    t: (key: string) => key,
    ...overrides,
  } as unknown as Parameters<typeof useEntryPublishing>[0]
}

function markReadyToPublish(publishing: ReturnType<typeof useEntryPublishing>) {
  publishing.setPublishReadiness({
    state: 'ready',
    message: 'Preview reviewed.',
    locales: ['en'],
    confirmationToken: 'publish-token',
    confirmationExpiresAt: Date.now() + 60_000,
  })
}

describe('useEntryPublishing', () => {
  beforeEach(() => {
    mutationFns.length = 0
    previewMutation.mockReset()
  })

  it('keeps the complete publish workflow in one resettable session', () => {
    const publishing = useEntryPublishing(createDeps())

    expect(publishing).not.toHaveProperty('showPublishDialog')
    expect(publishing).not.toHaveProperty('publishReadiness')
    expect(publishing).not.toHaveProperty('publishOutcome')

    publishing.handlePublishAll()
    markReadyToPublish(publishing)
    Object.assign(publishing.publishSession, {
      message: 'Ship both locales',
      preview: {
        allowed: true,
        summary: 'Ready to publish.',
        blockers: [],
        warnings: [],
        effects: [],
      },
      impactRequested: true,
      impactLocale: 'en',
      impactStale: false,
      draftPreviewOpened: true,
      concurrentEdit: true,
      outcome: {
        dirtyLocales: [],
        draftVersion: 7,
        locales: ['en', 'de'],
        message: 'Ship both locales',
        mode: 'all',
        versionId: 'revision-7',
      },
    })

    expect(publishing.publishSession).toMatchObject({
      open: true,
      mode: 'all',
      message: 'Ship both locales',
      impactRequested: true,
      draftPreviewOpened: true,
      concurrentEdit: true,
      readiness: { state: 'ready', confirmationToken: 'publish-token' },
    })

    publishing.markPublishReadinessStale()

    expect(publishing.publishSession.readiness).toMatchObject({
      state: 'stale',
      confirmationToken: null,
      confirmationExpiresAt: null,
    })
    expect(publishing.publishSession.outcome).toBeNull()

    publishing.resetPublishSession()

    expect(publishing.publishSession).toEqual({
      open: false,
      mode: 'single',
      message: '',
      readiness: {
        state: 'not_previewed',
        message: 'Preview website changes before publishing.',
        confirmationToken: null,
        confirmationExpiresAt: null,
        locales: [],
      },
      preview: null,
      impactRequested: false,
      impactLocale: null,
      impactStale: false,
      draftPreviewOpened: false,
      concurrentEdit: false,
      outcome: null,
    })
  })

  it('publishes with the session-held hydrated draft version, not the live one', async () => {
    // The live entry advanced to v7 (another session saved), but this session
    // hydrated v5 — publish must send v5 so the backend can reject it with
    // ENTRY_CONCURRENT_EDIT instead of silently publishing unseen content.
    const publishing = useEntryPublishing(createDeps({ hydratedDraftVersion: ref(5) }))
    markReadyToPublish(publishing)

    publishing.handlePublish()
    await publishing.confirmPublish()

    expect(mutationFns[0]).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 5,
        _confirmationToken: 'publish-token',
      }),
    )
  })

  it('falls back to the live draft version when no hydrated version is wired', async () => {
    const publishing = useEntryPublishing(createDeps())
    markReadyToPublish(publishing)

    publishing.handlePublish()
    await publishing.confirmPublish()

    expect(mutationFns[0]).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 7 }))
  })

  it('shows archive impact per locale with the restore path and a non-destructive confirm', async () => {
    previewMutation.mockResolvedValue({
      allowed: true,
      summary: 'Will archive "hello-world" and remove 2 public routes.',
      blockers: [],
      warnings: [
        {
          message:
            'Affected routes: en: https://site.test/blog/hello, de: https://site.test/de/blog/hallo',
        },
      ],
      confirmation: { token: 'archive-token', expiresAt: Date.now() + 60_000 },
      details: {
        publicRoutes: [
          { locale: 'en', href: 'https://site.test/blog/hello', path: '/blog/hello' },
          { locale: 'de', href: 'https://site.test/de/blog/hallo', path: '/blog/hallo' },
        ],
      },
    })
    const publishing = useEntryPublishing(createDeps())
    const confirmState = useStudioConfirmState()

    const archivePromise = publishing.handleArchive()
    await vi.waitFor(() => {
      expect(confirmState.activeRequest.value).not.toBeNull()
    })

    const request = confirmState.activeRequest.value!
    expect(request.description).toContain('Will archive "hello-world"')
    expect(request.description).toContain('EN · https://site.test/blog/hello')
    expect(request.description).toContain('DE · https://site.test/de/blog/hallo')
    // The restore path (t is identity in this test, so the key is the value).
    expect(request.description).toContain(
      'ginkoCms.studio.collectionEditor.archivedNoticeDescription',
    )
    // Archive is reversible: neutral confirm, not the red delete treatment.
    expect(request.confirmVariant).toBe('default')

    confirmState.cancel()
    await archivePromise
    // Cancelled: the archive mutation (third declared) must not run.
    expect(mutationFns[2]).not.toHaveBeenCalled()
  })

  it('binds current-locale and all-locale unpublish confirmations to the selected scope', async () => {
    previewMutation.mockResolvedValue({
      allowed: true,
      summary: 'Will unpublish selected locales.',
      blockers: [],
      warnings: [],
      confirmation: { token: 'unpublish-token', expiresAt: Date.now() + 60_000 },
    })
    const publishing = useEntryPublishing(
      createDeps({
        localeVariants: ref([
          { locale: 'en', published: true },
          { locale: 'de', published: true },
          { locale: 'fr', published: false },
        ]),
      }),
    )
    const confirmState = useStudioConfirmState()

    const currentPromise = publishing.handleUnpublish()
    await vi.waitFor(() => expect(confirmState.activeRequest.value).not.toBeNull())
    confirmState.confirm()
    await currentPromise
    expect(previewMutation).toHaveBeenLastCalledWith(expect.anything(), {
      entryId: 'entry-1',
      locales: ['en'],
    })
    expect(mutationFns[1]).toHaveBeenLastCalledWith({
      entryId: 'entry-1',
      locales: ['en'],
      _confirmationToken: 'unpublish-token',
    })

    const allPromise = publishing.handleUnpublishAll()
    await vi.waitFor(() => expect(confirmState.activeRequest.value).not.toBeNull())
    confirmState.confirm()
    await allPromise
    expect(previewMutation).toHaveBeenLastCalledWith(expect.anything(), {
      entryId: 'entry-1',
      locales: ['de', 'en'],
    })
    expect(mutationFns[1]).toHaveBeenLastCalledWith({
      entryId: 'entry-1',
      locales: ['de', 'en'],
      _confirmationToken: 'unpublish-token',
    })
  })

  it('restores an archived entry only with the backend preview token', async () => {
    previewMutation.mockResolvedValue({
      allowed: true,
      summary: 'Will restore "hello-world" as an unpublished draft.',
      blockers: [],
      warnings: [],
      confirmation: { token: 'restore-token', expiresAt: Date.now() + 60_000 },
    })
    const publishing = useEntryPublishing(createDeps())
    const confirmState = useStudioConfirmState()

    const restorePromise = publishing.handleRestore()
    await vi.waitFor(() => {
      expect(confirmState.activeRequest.value).not.toBeNull()
    })

    expect(confirmState.activeRequest.value?.confirmVariant).toBe('default')
    confirmState.confirm()
    await restorePromise

    expect(previewMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entryId: 'entry-1' }),
    )
    expect(mutationFns[3]).toHaveBeenCalledWith({
      entryId: 'entry-1',
      _confirmationToken: 'restore-token',
    })
  })

  it('[LIF-03] requires the exact stable identity and a current preview before permanent deletion', async () => {
    previewMutation.mockResolvedValue({
      allowed: true,
      summary: 'Will permanently delete archived entry "posts-0001".',
      blockers: [],
      warnings: [],
      confirmation: { token: 'delete-token', expiresAt: Date.now() + 60_000 },
    })
    const deps = createDeps({
      entry: ref({
        baseSlug: 'hello-world',
        draftVersion: 7,
        stableId: 'posts-0001',
        status: 'archived',
      }),
    })
    const publishing = useEntryPublishing(deps)
    const promptState = useStudioPromptState()
    const confirmState = useStudioConfirmState()

    const deletePromise = publishing.handlePermanentDelete()
    await vi.waitFor(() => expect(promptState.activePromptRequest.value).not.toBeNull())
    expect(promptState.activePromptRequest.value?.placeholder).toBe('DELETE posts-0001')
    promptState.submit('DELETE posts-0001')

    await vi.waitFor(() => expect(confirmState.activeRequest.value).not.toBeNull())
    expect(previewMutation).toHaveBeenCalledWith(expect.anything(), {
      entryId: 'entry-1',
      confirmationPhrase: 'DELETE posts-0001',
    })
    expect(confirmState.activeRequest.value?.confirmVariant).toBe('destructive')
    confirmState.confirm()
    await deletePromise

    expect(mutationFns[4]).toHaveBeenCalledWith({
      entryId: 'entry-1',
      confirmationPhrase: 'DELETE posts-0001',
      _confirmationToken: 'delete-token',
    })
    expect(deps.studioDebug.pushWithLogging).toHaveBeenCalledWith(
      deps.router,
      '/studio/content/posts',
      'permanently-delete-entry',
      expect.objectContaining({ stableId: 'posts-0001' }),
    )
  })
})
