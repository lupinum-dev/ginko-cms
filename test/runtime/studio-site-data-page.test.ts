// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

import StudioSiteDataPage from '../../packages/cms/studio-app/src/pages/site-data.vue'

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
}))

vi.mock('../../packages/cms/studio-app/src/composables/internal/useStudioSiteDataAdmin', () => ({
  useStudioSiteDataAdmin: () => mocks.admin,
}))

function createAdmin() {
  return {
    activeLocale: ref('en'),
    blockData: reactive<Record<string, Record<string, unknown>>>({}),
    blocks: ref([
      {
        key: 'announcement',
        label: 'Announcement',
        localized: true,
        updatedAt: 1,
        visibility: 'private',
      },
    ]),
    canManageSettings: ref(true),
    dateLocale: 'en',
    deleteTarget: ref(null),
    error: ref(''),
    expandedBlock: ref('announcement'),
    expandedBlockData: ref<
      | {
          key: string
          schemaType: null
        }
      | undefined
    >(undefined),
    handleCreateBlock: vi.fn(),
    handleDeleteBlock: vi.fn(),
    handleSave: vi.fn(),
    handleVisibilityChange: vi.fn(),
    info: ref(''),
    isLoading: ref(false),
    locales: ref([
      { code: 'en', label: 'English' },
      { code: 'de', label: 'Deutsch' },
    ]),
    newBlock: reactive({ key: '', label: '', localized: false, visibility: 'private' }),
    saving: ref(null),
    showNewForm: ref(false),
    t: (key: string) => (key === 'ginkoCms.common.loading' ? 'Loading...' : key),
    toggleBlock: vi.fn(),
    visibilityTarget: ref(null),
  }
}

describe('Studio site-data page', () => {
  beforeEach(() => {
    mocks.admin = createAdmin()
  })

  it('does not expose an editable block before the matching query result hydrates', async () => {
    const wrapper = shallowMount(StudioSiteDataPage, {
      global: {
        stubs: {
          Badge: true,
          Button: true,
          Icon: true,
          Input: true,
          Label: true,
          NuxtTime: true,
          ScrollArea: { template: '<div><slot /></div>' },
          Skeleton: true,
          StudioConfirmDialog: true,
          StudioDeveloperDetails: { template: '<div><slot /></div>' },
          StudioEmptyState: true,
          StudioListFrame: { template: '<section><slot /></section>' },
          StudioNotice: true,
          StudioPageBody: { template: '<div><slot /></div>' },
          StudioPageHeader: true,
          StudioSegmentedControl: true,
          StudioSiteDataEditor: true,
          StudioWorkspace: {
            template: '<main><slot name="header" /><slot name="toolbar" /><slot /></main>',
          },
          Switch: true,
        },
      },
    })
    const admin = mocks.admin as ReturnType<typeof createAdmin>

    expect(wrapper.get('[data-testid="cms-site-data-editor-loading"]').text()).toBe('Loading...')
    expect(wrapper.find('studio-site-data-editor-stub').exists()).toBe(false)

    admin.blockData.announcement = { message: 'Persisted value' }
    admin.expandedBlockData.value = { key: 'different-block', schemaType: null }
    await nextTick()
    expect(wrapper.find('studio-site-data-editor-stub').exists()).toBe(false)

    admin.expandedBlockData.value = { key: 'announcement', schemaType: null }
    await nextTick()

    expect(wrapper.find('[data-testid="cms-site-data-editor-loading"]').exists()).toBe(false)
    expect(wrapper.get('studio-site-data-editor-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Persisted value')
  })
})
