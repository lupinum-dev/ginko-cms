// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, type ComputedRef } from 'vue'

import StudioActivityPage from '../../packages/cms/studio-app/src/pages/activity.vue'

const accessState = vi.hoisted(() => ({ allowed: true, ready: true }))
const queryCapture = vi.hoisted(() => ({
  args: null as ComputedRef<Record<string, unknown>> | null,
  options: null as Record<string, unknown> | null,
}))

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: { ginkoCms: { editor: { listActivity: 'listActivity' } } },
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: { publishEntries: 'publishEntries' },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsConfig', () => ({
  useCmsConfig: () => ({ route: '/studio' }),
}))

const messages: Record<string, string> = {
  'ginkoCms.studio.activityPage.title': 'Activity log',
  'ginkoCms.studio.activityPage.description': 'Review operational and editorial history',
  'ginkoCms.studio.activityPage.accessRequired': 'Activity log requires publish access',
  'ginkoCms.studio.activityPage.accessRequiredDescription': 'Ask an owner for publish access.',
  'ginkoCms.studio.activityPage.filters': 'Activity filters',
  'ginkoCms.studio.activityPage.filterBy': 'Filter by',
  'ginkoCms.studio.activityPage.filterAll': 'All activity',
  'ginkoCms.studio.activityPage.filterContent': 'Content',
  'ginkoCms.studio.activityPage.filterCollection': 'Collection',
  'ginkoCms.studio.activityPage.filterActor': 'Actor',
  'ginkoCms.studio.activityPage.filterOperation': 'Operation type',
  'ginkoCms.studio.activityPage.filterResult': 'Result',
  'ginkoCms.studio.activityPage.filterTime': 'Time range',
  'ginkoCms.studio.activityPage.contentId': 'Content ID',
  'ginkoCms.studio.activityPage.collectionSlug': 'Collection slug',
  'ginkoCms.studio.activityPage.actorId': 'Actor ID',
  'ginkoCms.studio.activityPage.operationKind': 'Operation kind',
  'ginkoCms.studio.activityPage.result': 'Result',
  'ginkoCms.studio.activityPage.result_applied': 'Applied',
  'ginkoCms.studio.activityPage.result_failed': 'Failed',
  'ginkoCms.studio.activityPage.result_blocked': 'Blocked',
  'ginkoCms.studio.activityPage.result_stale': 'Stale',
  'ginkoCms.studio.activityPage.timeFrom': 'From',
  'ginkoCms.studio.activityPage.timeTo': 'To',
  'ginkoCms.studio.activityPage.applyFilter': 'Apply filter',
  'ginkoCms.studio.activityPage.clearFilter': 'Clear filter',
  'ginkoCms.studio.activityPage.filterValueRequired': 'Enter an exact value.',
  'ginkoCms.studio.activityPage.invalidTimeRange': 'Choose a valid time range.',
  'ginkoCms.studio.activityPage.empty': 'No activity yet',
  'ginkoCms.studio.activityPage.emptyDescription': 'Actions will appear here.',
  'ginkoCms.studio.activityPage.emptyFiltered': 'No matching activity',
  'ginkoCms.studio.activityPage.emptyFilteredDescription': 'Clear the exact filter.',
  'ginkoCms.studio.activityPage.loadError': 'Failed to load activity.',
  'ginkoCms.studio.activityPage.columnActivity': 'Activity',
  'ginkoCms.studio.activityPage.columnWhen': 'When',
  'ginkoCms.common.loadMore': 'Load more',
}

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    dateLocale: 'en',
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    ready: ref(accessState.ready),
    can: (permission: string) => ref(permission === 'publishEntries' && accessState.allowed),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery', () => ({
  useCmsStudioPaginatedQuery: (
    _query: string,
    args: ComputedRef<Record<string, unknown>>,
    options: Record<string, unknown>,
  ) => {
    queryCapture.args = args
    queryCapture.options = options
    return {
      error: ref(null),
      hasNextPage: ref(false),
      isLoading: ref(false),
      loadMore: vi.fn(),
      results: ref([]),
    }
  },
}))

vi.mock('@public/utils/cmsErrors', () => ({
  getCmsErrorMessage: (_cause: unknown, fallback: string) => fallback,
}))

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, size: String, variant: String },
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})

const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ['update:modelValue'],
  template:
    '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})

const SelectStub = defineComponent({
  name: 'Select',
  props: { modelValue: String },
  emits: ['update:modelValue'],
  template: '<div data-testid="filter-kind"><slot /></div>',
})

function stubs() {
  return {
    Badge: { template: '<span><slot /></span>' },
    Button: ButtonStub,
    Input: InputStub,
    Label: { template: '<label v-bind="$attrs"><slot /></label>' },
    NuxtLink: { props: { to: String }, template: '<a :href="to"><slot /></a>' },
    NuxtTime: { props: { datetime: [Number, String] }, template: '<time>{{ datetime }}</time>' },
    ScrollArea: { template: '<div><slot /></div>' },
    Select: SelectStub,
    SelectContent: { template: '<div><slot /></div>' },
    SelectItem: { props: { value: String }, template: '<span><slot /></span>' },
    SelectTrigger: { template: '<div v-bind="$attrs"><slot /></div>' },
    SelectValue: { template: '<span />' },
    Skeleton: { template: '<div />' },
    StudioDeveloperDetails: { template: '<div><slot /></div>' },
    StudioEmptyState: {
      props: { description: String, title: String },
      template:
        '<section><slot name="icon" /><h2>{{ title }}</h2><p>{{ description }}</p><slot name="action" /></section>',
    },
    StudioNotice: {
      props: { description: String, title: String },
      template: '<section><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
    StudioPageBody: { template: '<div><slot /></div>' },
    StudioPageHeader: {
      props: { description: String, title: String },
      template:
        '<header><h1>{{ title }}</h1><p>{{ description }}</p><slot name="actions" /></header>',
    },
    StudioWorkspace: { template: '<main><slot name="header" /><slot /></main>' },
  }
}

describe('Studio Activity page', () => {
  beforeEach(() => {
    accessState.allowed = true
    accessState.ready = true
    queryCapture.args = null
    queryCapture.options = null
  })

  it('[COL-02] exposes labeled server-filter controls to publishers and resets filtered empty state', async () => {
    const wrapper = mount(StudioActivityPage, { global: { stubs: stubs() } })

    expect(queryCapture.options?.requiredCapability).toBe('publishEntries')
    expect(wrapper.text()).toContain('Activity filters')
    expect(wrapper.text()).toContain('No activity yet')
    expect(wrapper.find('label[for="activity-filter-kind"]').exists()).toBe(true)

    wrapper.findComponent(SelectStub).vm.$emit('update:modelValue', 'collection')
    await nextTick()
    expect(wrapper.find('label[for="activity-filter-value"]').text()).toBe('Collection slug')
    await wrapper.find('#activity-filter-value').setValue('  posts  ')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(queryCapture.args?.value).toEqual({
      filter: { kind: 'collection', collection: 'posts' },
    })
    expect(wrapper.text()).toContain('No matching activity')

    const clear = wrapper.findAll('button').find((button) => button.text() === 'Clear filter')
    expect(clear).toBeDefined()
    await clear!.trigger('click')
    await nextTick()
    expect(queryCapture.args?.value).toEqual({})
    expect(wrapper.text()).toContain('No activity yet')
  })

  it('[COL-02] validates an incomplete time range without issuing a new query scope', async () => {
    const wrapper = mount(StudioActivityPage, { global: { stubs: stubs() } })
    wrapper.findComponent(SelectStub).vm.$emit('update:modelValue', 'time')
    await nextTick()
    expect(wrapper.find('label[for="activity-time-from"]').exists()).toBe(true)
    expect(wrapper.find('label[for="activity-time-to"]').exists()).toBe(true)

    await wrapper.find('#activity-time-from').setValue('2026-07-18T10:00')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(wrapper.find('[role="alert"]').text()).toBe('Choose a valid time range.')
    expect(queryCapture.args?.value).toEqual({})
  })

  it('[COL-02] sends the selected canonical result outcome to the server', async () => {
    const wrapper = mount(StudioActivityPage, { global: { stubs: stubs() } })
    wrapper.findComponent(SelectStub).vm.$emit('update:modelValue', 'result')
    await nextTick()

    const selects = wrapper.findAllComponents(SelectStub)
    expect(selects).toHaveLength(2)
    expect(wrapper.find('label[for="activity-result-outcome"]').text()).toBe('Result')
    selects[1]!.vm.$emit('update:modelValue', 'failed')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(queryCapture.args?.value).toEqual({
      filter: { kind: 'result', outcome: 'failed' },
    })
    expect(wrapper.text()).toContain('No matching activity')
  })

  it('[COL-02] shows a truthful publish-access empty state to editors and viewers', () => {
    accessState.allowed = false
    const wrapper = mount(StudioActivityPage, { global: { stubs: stubs() } })
    expect(wrapper.text()).toContain('Activity log requires publish access')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(queryCapture.options?.requiredCapability).toBe('publishEntries')
  })
})
