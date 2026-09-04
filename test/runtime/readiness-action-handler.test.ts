// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createReadinessActionHandler } from '../../packages/cms/studio-app/src/composables/internal/readinessActionHandler'
import type { StudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'
import { createReadinessAction } from '../../packages/contract/src/readiness'

function createEditorMock(overrides: { canPublishEntries?: boolean } = {}) {
  const routerPush = vi.fn()
  const handleSwitchLocale = vi.fn()
  const handlePublish = vi.fn(() => true)
  const previewPublishImpact = vi.fn()
  const editor = {
    loader: {
      router: { push: routerPush },
      canPublishEntries: overrides.canPublishEntries ?? true,
      currentLocale: 'en',
    },
    locales: { handleSwitchLocale },
    publishing: { handlePublish },
    workflow: { previewPublishImpact },
  } as unknown as StudioEntryEditorContext
  return {
    editor,
    routerPush,
    handleSwitchLocale,
    handlePublish,
    previewPublishImpact,
  }
}

describe('createReadinessActionHandler', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the field named by fieldPath (root segment for nested paths)', async () => {
    const input = document.createElement('input')
    input.id = 'title'
    input.scrollIntoView = vi.fn()
    document.body.append(input)

    const { editor } = createEditorMock()
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'fill_required_field',
      locale: 'en',
      target: 'field',
      params: { fieldPath: 'title.nested' },
    })

    expect(handler.canHandle(action)).toBe(true)
    await handler.handle(action)
    expect(document.activeElement).toBe(input)
  })

  it('does not claim field actions without a fieldPath', () => {
    const { editor } = createEditorMock()
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'fill_required_field',
      locale: 'en',
      target: 'field',
      params: {},
    })
    expect(handler.canHandle(action)).toBe(false)
  })

  it('switches locale for locale-target actions', async () => {
    const { editor, handleSwitchLocale } = createEditorMock()
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'add_locale',
      locale: 'de',
      target: 'locale',
      params: {},
    })
    expect(handler.canHandle(action)).toBe(true)
    await handler.handle(action)
    expect(handleSwitchLocale).toHaveBeenCalledWith('de')
  })

  it('routes review-target actions to the reviews page', async () => {
    const { editor, routerPush } = createEditorMock()
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'open_review',
      locale: null,
      target: 'review',
      params: {},
    })
    await handler.handle(action)
    expect(routerPush).toHaveBeenCalledWith('/reviews')
  })

  it('opens the publish preview flow for publish-target actions', async () => {
    const { editor, handlePublish, previewPublishImpact } = createEditorMock()
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'publish_locale',
      locale: 'en',
      target: 'publish',
      params: {},
    })
    expect(handler.canHandle(action)).toBe(true)
    await handler.handle(action)
    expect(handlePublish).toHaveBeenCalled()
    expect(previewPublishImpact).toHaveBeenCalledWith('en')
  })

  it('refuses publish-target actions without the publish capability', () => {
    const { editor } = createEditorMock({ canPublishEntries: false })
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'publish_locale',
      locale: 'en',
      target: 'publish',
      params: {},
    })
    expect(handler.canHandle(action)).toBe(false)
  })

  it('does not turn a route-collision suggestion into an unrelated preview action', async () => {
    const { editor, previewPublishImpact } = createEditorMock()
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'resolve_route_collision',
      locale: 'en',
      target: 'route',
      params: {},
    })
    expect(handler.canHandle(action)).toBe(false)
    await handler.handle(action)
    expect(previewPublishImpact).not.toHaveBeenCalled()
  })

  it('keeps non-executable backend suggestions label-only', () => {
    const { editor } = createEditorMock()
    const handler = createReadinessActionHandler(editor)
    const action = createReadinessAction({
      kind: 'request_review',
      locale: 'en',
      target: 'review',
      params: {},
    })
    expect(handler.canHandle(action)).toBe(false)
    expect(handler.canHandle(null)).toBe(false)
  })
})
