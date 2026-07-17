// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useEntryPublishing } from '../../packages/cms/studio-app/src/composables/internal/useEntryPublishing'
import { useStudioConfirmState } from '../../packages/cms/studio-app/src/composables/internal/useStudioConfirm'

// useConvexMutation is called once per operation in declaration order:
// publish, unpublish, archive, restore. Track the created mocks by index.
const { mutationFns, previewMutation } = vi.hoisted(() => ({
  mutationFns: [] as Array<ReturnType<typeof vi.fn>>,
  previewMutation: vi.fn(),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => {
    const fn = vi.fn(() => Promise.resolve({ dirtyLocales: [], draftVersion: 6, versionId: 'v-1' }))
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
})
