import type { Editor } from '@tiptap/core'
import type { Ref } from 'vue'

import { studioPrompt } from '../../composables/internal/useStudioPrompt'
import type { JsonRecord } from '../types'

export const headings = [
  { label: 'H1', level: 1 },
  { label: 'H2', level: 2 },
  { label: 'H3', level: 3 },
]

export const marks = [
  { icon: 'lucide:bold', name: 'bold', title: 'Bold' },
  { icon: 'lucide:italic', name: 'italic', title: 'Italic' },
  { icon: 'lucide:strikethrough', name: 'strike', title: 'Strikethrough' },
  { icon: 'lucide:code', name: 'code', title: 'Code' },
  { icon: 'lucide:link', name: 'link', title: 'Link' },
]

export const blocks = [
  { icon: 'lucide:list', name: 'bulletList', title: 'Bullet List' },
  { icon: 'lucide:list-ordered', name: 'orderedList', title: 'Numbered List' },
  { icon: 'lucide:quote', name: 'blockquote', title: 'Quote' },
  { icon: 'lucide:square-code', name: 'codeBlock', title: 'Code Block' },
]

type CommandChain = ReturnType<Editor['chain']> & {
  addColumnAfter: () => CommandChain
  addRowAfter: () => CommandChain
  addVideo: () => CommandChain
  deleteColumn: () => CommandChain
  deleteRow: () => CommandChain
  extendMarkRange: (mark: string) => CommandChain
  focus: () => CommandChain
  insertTable: (options: { cols: number; rows: number; withHeaderRow: boolean }) => CommandChain
  run: () => boolean
  setHorizontalRule: () => CommandChain
  setLink: (attrs: { href: string }) => CommandChain
  toggleBlockquote: () => CommandChain
  toggleBulletList: () => CommandChain
  toggleCodeBlock: () => CommandChain
  toggleHeading: (options: { level: 1 | 2 | 3 | 4 | 5 | 6 }) => CommandChain
  toggleMark: (name: string) => CommandChain
  toggleOrderedList: () => CommandChain
  unsetLink: () => CommandChain
}

export function useToolbarActions(editor: Ref<Editor | null | undefined>) {
  function insertImage(onOpenImage?: () => void) {
    onOpenImage?.()
  }

  function insertFile(onOpenFile?: () => void) {
    onOpenFile?.()
  }

  function insertVideo(onOpenVideo?: () => void) {
    onOpenVideo?.()
  }

  function removeMedia(onRemoveMedia?: () => void) {
    onRemoveMedia?.()
  }

  async function toggleMark(name: string) {
    const instance = editor.value
    if (!instance) {
      return
    }

    if (name === 'link') {
      if (instance.isActive('link')) {
        getChain(instance).extendMarkRange('link').unsetLink().run()
        return
      }

      const url = await readLinkUrl()
      if (!url) {
        return
      }

      getChain(instance).extendMarkRange('link').setLink({ href: url }).run()
      return
    }

    getChain(instance).toggleMark(name).run()
  }

  function toggleHeading(level: number) {
    const instance = editor.value
    if (!instance) {
      return
    }

    getChain(instance)
      .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
      .run()
  }

  function toggleBlock(name: string) {
    const instance = editor.value
    if (!instance) {
      return
    }

    const chain = getChain(instance)

    if (name === 'bulletList') {
      chain.toggleBulletList().run()
    } else if (name === 'orderedList') {
      chain.toggleOrderedList().run()
    } else if (name === 'blockquote') {
      chain.toggleBlockquote().run()
    } else if (name === 'codeBlock') {
      chain.toggleCodeBlock().run()
    }
  }

  function insertHr() {
    const instance = editor.value
    if (!instance) {
      return
    }

    getChain(instance).setHorizontalRule().run()
  }

  function insertTable() {
    const instance = editor.value
    if (!instance) {
      return
    }

    getChain(instance).insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run()
  }

  function addRowAfter() {
    const instance = editor.value
    if (!instance) {
      return
    }

    getChain(instance).addRowAfter().run()
  }

  function addColumnAfter() {
    const instance = editor.value
    if (!instance) {
      return
    }

    getChain(instance).addColumnAfter().run()
  }

  function deleteRow() {
    const instance = editor.value
    if (!instance) {
      return
    }

    getChain(instance).deleteRow().run()
  }

  function deleteColumn() {
    const instance = editor.value
    if (!instance) {
      return
    }

    getChain(instance).deleteColumn().run()
  }

  function isActive(name: string, attrs?: JsonRecord) {
    return editor.value?.isActive(name, attrs) ?? false
  }

  return {
    addColumnAfter,
    addRowAfter,
    blocks,
    deleteColumn,
    deleteRow,
    headings,
    insertFile,
    insertHr,
    insertImage,
    insertTable,
    insertVideo,
    isActive,
    marks,
    removeMedia,
    toggleBlock,
    toggleHeading,
    toggleMark,
  }
}

function getChain(editor: Editor) {
  return editor.chain().focus() as unknown as CommandChain
}

async function readLinkUrl() {
  const value = await studioPrompt({
    title: 'Insert link',
    label: 'URL',
    placeholder: 'https://example.com',
    confirmLabel: 'Apply link',
  })
  const normalized = value?.trim()
  return normalized ? normalized : null
}
