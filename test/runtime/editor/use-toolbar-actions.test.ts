import type { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useToolbarActions } from '../../../packages/cms/studio-app/src/editor/model/useToolbarActions'

const studioPrompt = vi.hoisted(() => vi.fn())

vi.mock('../../../packages/cms/studio-app/src/composables/internal/useStudioPrompt', () => ({
  studioPrompt,
}))

type TestChain = {
  addColumnAfter: ReturnType<typeof vi.fn>
  addRowAfter: ReturnType<typeof vi.fn>
  deleteColumn: ReturnType<typeof vi.fn>
  deleteRow: ReturnType<typeof vi.fn>
  extendMarkRange: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  insertTable: ReturnType<typeof vi.fn>
  run: ReturnType<typeof vi.fn>
  setHorizontalRule: ReturnType<typeof vi.fn>
  setLink: ReturnType<typeof vi.fn>
  toggleBlockquote: ReturnType<typeof vi.fn>
  toggleBulletList: ReturnType<typeof vi.fn>
  toggleCodeBlock: ReturnType<typeof vi.fn>
  toggleHeading: ReturnType<typeof vi.fn>
  toggleMark: ReturnType<typeof vi.fn>
  toggleOrderedList: ReturnType<typeof vi.fn>
  unsetLink: ReturnType<typeof vi.fn>
}

function createChain(): TestChain {
  const chain = {
    addColumnAfter: vi.fn(() => chain),
    addRowAfter: vi.fn(() => chain),
    extendMarkRange: vi.fn(() => chain),
    focus: vi.fn(() => chain),
    insertTable: vi.fn(() => chain),
    run: vi.fn(() => true),
    setHorizontalRule: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
    toggleBlockquote: vi.fn(() => chain),
    toggleBulletList: vi.fn(() => chain),
    toggleCodeBlock: vi.fn(() => chain),
    toggleHeading: vi.fn(() => chain),
    toggleMark: vi.fn(() => chain),
    toggleOrderedList: vi.fn(() => chain),
    unsetLink: vi.fn(() => chain),
    deleteRow: vi.fn(() => chain),
    deleteColumn: vi.fn(() => chain),
  }

  return chain
}

describe('useToolbarActions', () => {
  it('toggles basic marks and blocks through the editor chain', () => {
    const chain = createChain()
    const editor = {
      chain: vi.fn(() => chain),
      isActive: vi.fn(() => false),
    }

    const actions = useToolbarActions(ref(editor as unknown as Editor))
    actions.toggleMark('bold')
    actions.toggleHeading(2)
    actions.toggleBlock('blockquote')
    actions.insertHr()
    actions.insertTable()

    expect(chain.focus).toHaveBeenCalled()
    expect(chain.toggleMark).toHaveBeenCalledWith('bold')
    expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 2 })
    expect(chain.toggleBlockquote).toHaveBeenCalled()
    expect(chain.setHorizontalRule).toHaveBeenCalled()
    expect(chain.insertTable).toHaveBeenCalledWith({ cols: 3, rows: 3, withHeaderRow: true })
  })

  it('delegates media insertion to provided callbacks', () => {
    const image = vi.fn()
    const file = vi.fn()
    const remove = vi.fn()
    const video = vi.fn()
    const actions = useToolbarActions(ref(null))

    actions.insertImage(image)
    actions.insertFile(file)
    actions.insertVideo(video)
    actions.removeMedia(remove)

    expect(image).toHaveBeenCalled()
    expect(file).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
    expect(video).toHaveBeenCalled()
  })

  it('sets and unsets links using prompt input', async () => {
    const chain = createChain()
    studioPrompt.mockResolvedValue('https://example.com')

    const editor = {
      chain: vi.fn(() => chain),
      isActive: vi.fn((name: string) => (name === 'link' ? false : false)),
    }

    const actions = useToolbarActions(ref(editor as unknown as Editor))
    await actions.toggleMark('link')

    expect(studioPrompt).toHaveBeenCalled()
    expect(chain.extendMarkRange).toHaveBeenCalledWith('link')
    expect(chain.setLink).toHaveBeenCalledWith({ href: 'https://example.com' })

    editor.isActive.mockImplementation((name: string) => name === 'link')
    await actions.toggleMark('link')
    expect(chain.unsetLink).toHaveBeenCalled()
  })
})
