import { describe, expect, it, vi } from 'vitest'
import { effectScope, reactive, ref } from 'vue'

import { useStudioEntryWorkflow } from '../../packages/cms/studio-app/src/composables/internal/useStudioEntryWorkflow'

const mocks = vi.hoisted(() => ({
  previewPublish: vi.fn(),
  query: vi.fn(),
}))

vi.mock('@lupinum/better-convex-vue', () => ({
  useConvex: () => ({ query: mocks.query }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: ref(null),
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(async () => undefined),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioAdvancedEditor', () => ({
  useStudioAdvancedEditor: () => ref(false),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => mocks.previewPublish,
}))

function readinessDetail() {
  return {
    entryId: 'entry-1',
    collection: 'posts',
    primaryLocale: 'en',
    updatedAt: 1,
    locales: [
      {
        locale: 'en',
        state: 'ready_to_publish',
        blockers: [],
        warnings: [],
        infos: [],
        nextAction: { kind: 'publish', locale: 'en', target: 'publish', params: {} },
        draftExists: true,
        published: false,
        hasUnpublishedChanges: true,
        canPreview: true,
        canRequestReview: false,
        canPublish: true,
        canArchive: false,
        publicUrl: '/posts/entry',
        draftUrl: '/preview/posts/entry',
        affectedPublicUrls: [],
        reviewRequestId: null,
        currentDraftVersion: 7,
        currentPublishedRevisionId: null,
      },
    ],
  }
}

function editorFixture() {
  const publishSession = reactive({
    open: true,
    mode: 'single' as const,
    message: '',
    readiness: {
      state: 'ready',
      message: 'Old preview is ready.',
      confirmationToken: 'old-token',
      confirmationExpiresAt: Date.now() + 60_000,
      locales: ['en'],
    },
    preview: {
      allowed: true,
      blockers: [],
      warnings: [],
      summary: 'OLD PREVIEW MUST DISAPPEAR',
      confirmation: { token: 'old-token', expiresAt: Date.now() + 60_000 },
      details: { publishImpact: { status: 'ready', locales: [], cacheTags: [], events: [] } },
    } as unknown,
    impactRequested: true,
    impactLocale: 'en' as string | null,
    impactStale: false,
    draftPreviewOpened: true,
    concurrentEdit: false,
    outcome: null,
  })
  return reactive({
    loader: {
      collection: 'posts',
      entryId: 'entry-1',
      currentLocale: 'en',
      entry: { draftVersion: 7 },
      t: (key: string) => key,
    },
    draft: {
      isDirty: false,
      saveConflict: false,
      error: '',
      lastHydratedVersion: 7,
      handleSaveDraft: vi.fn(async () => true),
      requestHydrate: vi.fn(),
    },
    publishing: {
      publishSession,
      setPublishReadiness(next: Record<string, unknown>) {
        Object.assign(publishSession.readiness, next)
      },
      markPublishReadinessStale: vi.fn(),
      resetPublishSession: vi.fn(),
    },
  })
}

describe('Studio publish preview state', () => {
  it('retires the old preview synchronously before pending work and installs only the new result', async () => {
    let resolveReadiness!: (value: ReturnType<typeof readinessDetail>) => void
    mocks.query.mockReturnValueOnce(
      new Promise<ReturnType<typeof readinessDetail>>((resolve) => {
        resolveReadiness = resolve
      }),
    )
    const freshPreview = {
      allowed: true,
      blockers: [],
      warnings: [],
      summary: 'Fresh preview',
      confirmation: { token: 'fresh-token', expiresAt: Date.now() + 60_000 },
      details: { publishImpact: { status: 'ready', locales: [], cacheTags: [], events: [] } },
    }
    mocks.previewPublish.mockResolvedValueOnce(freshPreview)
    const editor = editorFixture()
    const scope = effectScope()
    const workflow = scope.run(() => useStudioEntryWorkflow(editor as never))!

    const request = workflow.previewPublishImpact('en', { saveDraft: false })

    expect(editor.publishing.publishSession.preview).toBeNull()
    expect(editor.publishing.publishSession.readiness.state).toBe('pending')
    expect(workflow.publishImpact).toMatchObject({ state: 'pending', pending: true })
    expect(JSON.stringify(workflow.publishImpact)).not.toContain('OLD PREVIEW MUST DISAPPEAR')

    resolveReadiness(readinessDetail())
    await request

    expect(editor.publishing.publishSession.preview).toStrictEqual(freshPreview)
    expect(editor.publishing.publishSession.readiness.state).toBe('ready')
    scope.stop()
  })
})
