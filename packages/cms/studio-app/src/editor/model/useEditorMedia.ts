import type { Editor as TiptapEditor } from '@tiptap/core'
import type { ComputedRef, Ref } from 'vue'

import { studioPrompt } from '../../composables/internal/useStudioPrompt'
import { pushEditorDebugEvent } from '../lib/debug'
import type { AssetInfo, AssetProvider } from '../types'

type EditorMediaOptions = {
  assetProvider: ComputedRef<AssetProvider>
  editor: Ref<TiptapEditor | undefined>
}

export function useEditorMedia({ assetProvider, editor }: EditorMediaOptions) {
  function insertImageAsset(asset: Partial<AssetInfo>) {
    const instance = editor.value
    if (!instance) return

    const payload = {
      alt: asset.alt,
      filename: asset.filename,
      height: asset.height,
      id: asset.id,
      src: asset.url || assetProvider.value.buildUrl(asset),
      title: asset.title,
      width: asset.width,
    }
    pushEditorDebugEvent({
      level: 'log',
      message: instance.isActive('image') ? 'Replacing selected image' : 'Inserting image',
      payload,
      source: 'editor.media.image',
    })
    if (instance.isActive('image')) {
      instance.chain().focus().updateAttributes('image', { props: payload }).run()
      return
    }

    const chain = instance.chain().focus() as unknown as {
      setImage: (options: Record<string, unknown>) => { run: () => void }
    }
    chain.setImage(payload).run()
  }

  function insertFileAsset(asset: Partial<AssetInfo>) {
    const instance = editor.value
    if (!instance) return

    const payload = {
      filename: asset.filename,
      id: asset.id,
      size: asset.size,
      src: asset.url || assetProvider.value.buildUrl(asset),
      title: asset.title || asset.filename,
      type: asset.mimeType,
    }
    pushEditorDebugEvent({
      level: 'log',
      message: instance.isActive('file') ? 'Replacing selected file' : 'Inserting file',
      payload,
      source: 'editor.media.file',
    })
    if (instance.isActive('file')) {
      instance.chain().focus().updateAttributes('file', { props: payload }).run()
      return
    }

    const chain = instance.chain().focus() as unknown as {
      setFile: (options: Record<string, unknown>) => { run: () => void }
    }
    chain.setFile(payload).run()
  }

  async function insertVideoFromPrompt() {
    const src = (
      await studioPrompt({
        title: 'Insert video',
        label: 'Video URL',
        placeholder: 'https://example.com/video.mp4',
        confirmLabel: 'Continue',
      })
    )?.trim()
    if (!src || !editor.value) return

    const title =
      (
        await studioPrompt({
          title: 'Video title',
          label: 'Title',
          description: 'Optional.',
          confirmLabel: 'Insert video',
        })
      )?.trim() || undefined
    const instance = editor.value
    if (!instance) return
    const payload = { src, title }
    pushEditorDebugEvent({
      level: 'log',
      message: instance.isActive('video') ? 'Updating selected video' : 'Inserting video',
      payload,
      source: 'editor.media.video',
    })
    if (instance.isActive('video')) {
      instance.chain().focus().updateAttributes('video', { props: payload, src, title }).run()
      return
    }

    const chain = instance.chain().focus() as unknown as {
      setVideo: (attrs: Record<string, unknown>) => { run: () => void }
    }
    chain.setVideo(payload).run()
  }

  function removeSelectedMedia() {
    const instance = editor.value
    if (!instance) return
    if (!instance.isActive('image') && !instance.isActive('file') && !instance.isActive('video')) {
      return
    }

    pushEditorDebugEvent({
      level: 'warn',
      message: 'Removing selected media node',
      payload: {
        selection: {
          empty: instance.state.selection.empty,
          from: instance.state.selection.from,
          to: instance.state.selection.to,
        },
      },
      source: 'editor.media.remove',
    })
    instance.view.dispatch(instance.state.tr.deleteSelection())
  }

  return {
    insertFileAsset,
    insertImageAsset,
    insertVideoFromPrompt,
    removeSelectedMedia,
  }
}
