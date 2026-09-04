// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive, ref } from 'vue'

import StudioSettingsStorageSection from '../../packages/cms/studio-app/src/components/studio/settings/StudioSettingsStorageSection.vue'

const ButtonStub = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  template:
    '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})

const NoticeStub = defineComponent({
  props: { tone: String, title: String, description: String },
  template:
    '<aside :data-tone="tone"><strong>{{ title }}</strong><span>{{ description }}</span></aside>',
})

function buildAdmin() {
  return reactive({
    canManageSettings: true,
    t: (key: string, params?: Record<string, unknown>) =>
      `${key}${params ? `:${JSON.stringify(params)}` : ''}`,
    storageError: '',
    storageHealth: {
      status: 'attention' as const,
      checkedAt: 1,
      usage: {
        trackedAssets: 12,
        trackedBytes: 2048,
        quotaBytes: null,
        quotaSource: 'provider-managed' as const,
      },
      constraints: { supportedAssets: 500, countComplete: true },
      bytes: { checked: 12, missing: 1 },
      operations: { pendingUploads: 0, terminalCleanupFailures: 0 },
      issues: [{ code: 'missing-bytes', count: 1, message: 'Tracked bytes are missing.' }],
    },
    storageHealthQuery: { pending: ref(false) },
    storageDiagnostic: null as null | {
      status: 'healthy' | 'missing-setup' | 'quota-or-limit' | 'temporary-failure'
      message: string
    },
    storageDiagnosticRunning: false,
    refreshStorageHealth: vi.fn(),
    handleRunStorageDiagnostic: vi.fn(),
    formatBytes: (value: number) => `${value} bytes`,
  })
}

function mountSection(admin = buildAdmin()) {
  return {
    admin,
    wrapper: mount(StudioSettingsStorageSection, {
      props: { admin: admin as never },
      global: { stubs: { Button: ButtonStub, StudioNotice: NoticeStub } },
    }),
  }
}

describe('Studio storage settings', () => {
  it('[ADM-06] shows bounded usage, honest provider-managed quota, health issues, and safe actions', async () => {
    const { admin, wrapper } = mountSection()

    expect(wrapper.text()).toContain('2048 bytes')
    expect(wrapper.text()).toContain('storageQuotaProviderManaged')
    expect(wrapper.text()).toContain('Tracked bytes are missing.')
    expect(wrapper.text()).toContain('storageDiagnosticDescription')
    expect(wrapper.text()).not.toContain('credential')

    const buttons = wrapper.findAll('button')
    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')
    expect(admin.refreshStorageHealth).toHaveBeenCalledOnce()
    expect(admin.handleRunStorageDiagnostic).toHaveBeenCalledOnce()
  })

  it('[ADM-06] distinguishes healthy, missing, quota, and temporary diagnostic outcomes with redacted copy', async () => {
    const { admin, wrapper } = mountSection()
    for (const status of [
      'healthy',
      'missing-setup',
      'quota-or-limit',
      'temporary-failure',
    ] as const) {
      admin.storageDiagnostic = { status, message: `redacted ${status}` }
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain(`storageDiagnosticStatus_${status}`)
      expect(wrapper.text()).toContain(`redacted ${status}`)
    }
  })

  it('[ADM-06] renders no storage controls for a read-only role', () => {
    const admin = buildAdmin()
    admin.canManageSettings = false
    const { wrapper } = mountSection(admin)

    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
