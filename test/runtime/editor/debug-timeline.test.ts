import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearEditorDebugEvents,
  getEditorDebugEvents,
  pushEditorDebugEvent,
  serializeDebugPayload,
  setDebugEnabled,
} from '../../../packages/cms/studio-app/src/editor/lib/debug'

describe('editor debug timeline', () => {
  beforeEach(() => {
    clearEditorDebugEvents()
    setDebugEnabled(true)
  })

  it('stores structured debug events in order', () => {
    pushEditorDebugEvent({
      level: 'log',
      message: 'first',
      payload: { from: 1, to: 2 },
      source: 'editor.selection',
    })
    pushEditorDebugEvent({
      level: 'warn',
      message: 'second',
      payload: { steps: 1 },
      source: 'editor.transaction',
    })

    expect(getEditorDebugEvents().value).toHaveLength(2)
    expect(getEditorDebugEvents().value[0]?.message).toBe('first')
    expect(getEditorDebugEvents().value[1]?.source).toBe('editor.transaction')
  })

  it('serializes circular payloads safely', () => {
    const payload: Record<string, unknown> = { name: 'test' }
    payload.self = payload

    expect(serializeDebugPayload(payload)).toEqual({
      name: 'test',
      self: '[circular]',
    })
  })

  it('does not record events while debug is disabled', () => {
    setDebugEnabled(false)

    pushEditorDebugEvent({
      level: 'log',
      message: 'ignored',
      payload: { ok: false },
      source: 'editor.selection',
    })

    expect(getEditorDebugEvents().value).toHaveLength(0)
  })
})
