// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref, Suspense } from 'vue'

import ArticlePreview from '../../playground/app/pages/preview/[collection]/[id].vue'

vi.mock('#convex/api', () => ({
  api: { ginkoCms: { draftPreview: { getDraftPreview: 'preview' } } },
}))
const route = reactive({
  params: { collection: 'blog', id: 'entry-1' },
  query: { locale: 'de' },
  path: '/preview/blog/entry-1',
  fullPath: '/preview/blog/entry-1?locale=de',
})
const payload = ref({
  entryId: 'entry-1',
  collection: 'blog',
  locale: 'de',
  title: 'Unser Garten',
  status: 'published',
  path: '/blog/new-garden',
  publishedPath: '/blog/old-garden',
  data: { description: 'Together' },
  bodyAstJson: JSON.stringify({ type: 'root', children: [] }),
})
const error = ref<unknown>(null)
const auth = reactive({ status: ref('authenticated'), pending: ref(false) })
const push = vi.fn(async () => {})
const refresh = vi.fn(async () => {})
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  route.query.locale = 'de'
  payload.value.locale = 'de'
  error.value = null
  push.mockClear()
  refresh.mockClear()
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({ push }))
  vi.stubGlobal('useI18n', () => ({
    defaultLocale: () => 'en',
    localePath: (path: string, locale: string) => (locale === 'en' ? path : `/${locale}${path}`),
  }))
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useConvexAuth', () => ({ status: ref(auth.status), pending: ref(false) }))
  vi.stubGlobal('useConvexQuery', async () => ({
    data: payload,
    pending: ref(false),
    error,
    refresh,
  }))
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
})
async function open() {
  const Host = defineComponent({
    setup: () => () => h(Suspense, null, { default: () => h(ArticlePreview) }),
  })
  wrapper = mount(Host, {
    global: {
      stubs: {
        ClientOnly: { template: '<div><slot /></div>' },
        NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        ContentRenderer: {
          props: ['value'],
          template:
            '<div data-rendered :data-collection="value.collection" :data-locale="value.locale">{{ value.title }}</div>',
        },
        LandingDraftEditor: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('private article preview shell', () => {
  it('keeps exact locale and separates the working target from the existing published route', async () => {
    const page = await open()
    expect(page.text()).toContain('Shared working version')
    expect(page.text()).not.toContain('Unpublished changes')
    expect(page.text()).toContain('/de/blog/new-garden')
    expect(
      page
        .findAll('a')
        .find((link) => link.text() === 'View published')
        ?.attributes('href'),
    ).toBe('/de/blog/old-garden')
    expect(page.find('article').attributes('lang')).toBe('de')
    // Content selects the render policy and localized links from the document,
    // independently of the private preview route's own locale.
    expect(page.find('[data-rendered]').attributes('data-collection')).toBe('blog')
    expect(page.find('[data-rendered]').attributes('data-locale')).toBe('de')
    await page.find('select').setValue('en')
    expect(push).toHaveBeenCalledWith({ path: route.path, query: { locale: 'en' } })
    route.query.locale = 'en'
    await flushPromises()
    expect(page.find('[data-rendered]').exists()).toBe(false)
  })
  it('fails visibly for malformed AST transport instead of rendering partial content', async () => {
    const original = payload.value.bodyAstJson
    payload.value.bodyAstJson = '{invalid'
    const page = await open()
    expect(page.text()).toContain('Draft preview unavailable')
    expect(page.find('[data-rendered]').exists()).toBe(false)
    expect(page.text()).toContain('Try again')
    payload.value.bodyAstJson = original
  })

  it('reports missing languages with Studio and retry actions without showing the old language', async () => {
    error.value = {
      data: JSON.stringify({ code: 'DRAFT_PREVIEW_LOCALE_MISSING', message: 'No draft' }),
    }
    const page = await open()
    expect(page.text()).toContain('This language has no draft')
    expect(page.find('[data-rendered]').exists()).toBe(false)
    await page.find('button').trigger('click')
    expect(refresh).toHaveBeenCalledOnce()
    expect(
      page
        .findAll('a')
        .some((link) => link.attributes('href') === '/studio/content/blog/entry-1?locale=de'),
    ).toBe(true)
  })
})
