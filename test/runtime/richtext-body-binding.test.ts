// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'

import FieldRichtext from '../../packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue'
import type { StudioAssetContext } from '../../packages/cms/studio-app/src/composables/internal/types'

const state = vi.hoisted(() => ({
  context: undefined as Ref<StudioAssetContext | undefined> | undefined,
}))
vi.mock('../../packages/cms/studio-app/src/composables/internal/useSharedEntryBody', () => ({
  useSharedEntryBody: (context: Ref<StudioAssetContext | undefined>) => {
    state.context = context
    return { mode: ref('local'), ready: ref(true), mountKey: ref(0), session: ref(), state: ref() }
  },
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({ data: ref({}), status: ref('success') }),
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))
vi.mock(
  '../../packages/cms/studio-app/src/components/studio/fields/StudioRichtextImageLibrary.vue',
  () => ({
    default: defineComponent({ setup: () => () => h('div') }),
  }),
)

describe('canonical body binding', () => {
  it.each([
    { bodyField: 'article', fieldPath: 'article', shared: true },
    { bodyField: 'body', fieldPath: 'article', shared: false },
    { bodyField: 'article', fieldPath: 'section.article', shared: false },
    { bodyField: null, fieldPath: 'article', shared: false },
  ])(
    'binds only the installed top-level body: $bodyField / $fieldPath',
    ({ bodyField, fieldPath, shared }) => {
      const context = { entryId: 'entry', locale: 'en', collection: 'pages', bodyField }
      const wrapper = mount(FieldRichtext, {
        props: {
          field: { key: 'article', type: 'richtext' },
          fieldPath,
          modelValue: '',
          label: 'Article',
          fieldError: null,
          assetContext: context,
        },
        global: {
          stubs: {
            StudioFieldShell: { template: '<div><slot /></div>' },
            GinkoEditor: true,
            StudioRichtextImageLibrary: true,
            StudioAssetPicker: true,
          StudioAssetMetadataDialog: true,
          Button: true,
          Icon: true,
          },
        },
      })
      try {
        expect(state.context?.value).toEqual(shared ? context : undefined)
      } finally {
        wrapper.unmount()
      }
    },
  )
})
