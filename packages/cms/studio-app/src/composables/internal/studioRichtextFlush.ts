import type { EditorFlushResult, GinkoEditorHandle } from '@lupinum/ginko-editor'
import { computed, inject, provide, ref } from 'vue'

const studioRichtextFlushKey = Symbol('studio-richtext-flush')

export function provideStudioRichtextFlush() {
  const handles = new Map<string, GinkoEditorHandle>()
  const pendingIds = ref(new Set<string>())
  const sharedBodies = ref(new Map<string, string>())

  const registry = {
    sharedBodyLocales: computed(() => new Set(sharedBodies.value.values())),
    setSharedBody(id: string, locale: string | undefined) {
      const next = new Map(sharedBodies.value)
      if (locale) next.set(id, locale)
      else next.delete(id)
      sharedBodies.value = next
    },
    hasPending: computed(() => pendingIds.value.size > 0),
    register(id: string, handle: GinkoEditorHandle) {
      handles.set(id, handle)
      return () => {
        handles.delete(id)
        registry.setSharedBody(id, undefined)
        const next = new Set(pendingIds.value)
        next.delete(id)
        pendingIds.value = next
      }
    },
    setPending(id: string, pending: boolean) {
      const next = new Set(pendingIds.value)
      if (pending) next.add(id)
      else next.delete(id)
      pendingIds.value = next
    },
    async flush(): Promise<EditorFlushResult> {
      let emitted = false
      for (const handle of handles.values()) {
        const result = await handle.flush()
        if (!result.ok) return result
        emitted ||= result.emitted
      }
      return { emitted, ok: true }
    },
  }
  provide(studioRichtextFlushKey, registry)
  return registry
}

export type StudioRichtextFlush = ReturnType<typeof provideStudioRichtextFlush>

export function useOptionalStudioRichtextFlush() {
  return inject<StudioRichtextFlush | null>(studioRichtextFlushKey, null)
}
