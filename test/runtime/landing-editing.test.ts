// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref, Suspense } from 'vue'

import type { DraftSaveRequest } from '../../packages/cms/src/public/editing/session'
import { buildPreview, type PreviewResult } from '../../packages/convex/src/operationPreview'
import LandingDraftEditor from '../../playground/app/components/landing/LandingDraftEditor.vue'
import LandingPage from '../../playground/app/components/landing/LandingPage.vue'
import LandingText from '../../playground/app/components/landing/LandingText.vue'
import {
  landing_content,
  landing_image,
  landing_link,
} from '../../playground/app/utils/landingContent'

const routes = vi.hoisted(() => ({ leave: vi.fn(), update: vi.fn() }))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: routes.leave,
  onBeforeRouteUpdate: routes.update,
}))
vi.mock('#convex/api', () => ({
  api: {
    ginkoCms: {
      editor: {
        getEntry: 'entry',
        saveEntryDraft: 'save',
        createLocaleVariant: 'create',
        previewPublishEntryOperation: 'preview',
        publishEntry: 'publish',
      },
      assets: { resolveAssetUrls: 'urls', getAssetManagerData: 'assets' },
      reviewRequests: { requestPublishReview: 'review' },
    },
  },
}))

function savedEntry() {
  return {
    _id: 'entry-1',
    collection: 'landing',
    draftVersion: 1,
    locale: 'en',
    slug: 'home',
    baseSlug: 'home',
    parentEntryId: null,
    nodeKind: 'page',
    draft: { operational: 'keep' },
    publishedData: {
      title: 'Published title',
      description: 'Published introduction',
      hero_image: 'asset-published',
      hero_alt: 'Published landscape',
    },
    localeData: {
      draftId: 'draft-en',
      draftSlug: null,
      draftPath: '/landing/home',
      publishedPath: '/landing/home',
      draft: {
        values: {
          title: 'Working title',
          description: 'Working introduction',
          cta_href: '/blog',
          hero_image: '',
          hero_alt: '',
          custom: 'preserve',
        },
        bodyMdc: '',
      },
      published: { values: { title: 'Published title' } },
    },
    locales: [
      { locale: 'en', draftExists: true, draftId: 'draft-en' },
      { locale: 'de', draftExists: false, draftId: null },
    ],
    _can: { edit: true, publish: true },
  }
}
const entry = ref(savedEntry())
const error = ref<Error | null>(null)
const push = vi.fn(async () => {})
const localePath = vi.fn((path: string, locale: string) =>
  locale === 'en' ? path : `/${locale}${path}`,
)
const save = vi.fn(async (request: DraftSaveRequest) => {
  const values = request.patch.locales?.en?.values ?? {}
  entry.value = {
    ...entry.value,
    draftVersion: entry.value.draftVersion + 1,
    localeData: {
      ...entry.value.localeData,
      draft: {
        ...entry.value.localeData.draft,
        values: { ...entry.value.localeData.draft.values, ...values },
      },
    },
  }
  return { draftVersion: entry.value.draftVersion }
})
const preview = vi.fn(
  async (): Promise<PreviewResult> => ({
    ...buildPreview({}),
    allowed: true,
    summary: 'Publish one language',
    blockers: [],
    warnings: [],
    effects: [{ kind: 'publish', summary: 'English public page changes' }],
    confirmation: { token: 'review-token', expiresAt: Date.now() + 60_000 },
  }),
)
const publish = vi.fn(async () => ({
  status: 'applied',
  value: { draftVersion: entry.value.draftVersion },
}))
const review = vi.fn(async () => ({}))
const create = vi.fn(async () => 'created')
const mutations = { save, preview, publish, review, create }
let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  entry.value = savedEntry()
  error.value = null
  for (const mutation of Object.values(mutations)) mutation.mockClear()
  push.mockClear()
  localePath.mockClear()
  routes.leave.mockClear()
  vi.stubGlobal('useRoute', () =>
    reactive({ path: '/preview/landing/entry-1', query: { locale: 'en' } }),
  )
  vi.stubGlobal('useRouter', () => ({ push }))
  vi.stubGlobal('useI18n', () => ({ localePath }))
  vi.stubGlobal('useConvexMutation', (key: keyof typeof mutations) => mutations[key])
  vi.stubGlobal('useConvexQuery', async (key: string) => ({
    data:
      key === 'entry'
        ? entry
        : key === 'urls'
          ? ref({
              'asset-published': 'https://assets.example/published.jpg',
              'asset-new': 'https://assets.example/new.jpg',
            })
          : ref({
              page: [
                {
                  id: 'asset-new',
                  filename: 'Landscape.jpg',
                  url: 'https://assets.example/new.jpg',
                  alt: { en: 'A green valley' },
                },
              ],
            }),
    error: key === 'entry' ? error : ref(null),
    pending: ref(false),
    refresh: vi.fn(async () => {}),
  }))
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

async function openEditor() {
  const Host = defineComponent({
    setup: () => () =>
      h(Suspense, null, {
        default: () => h(LandingDraftEditor, { entry_id: 'entry-1', locale: entry.value.locale }),
      }),
  })
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      components: { LandingPage, LandingText },
      stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
    },
  })
  await flushPromises()
  return wrapper
}
function button(label: string) {
  const result = wrapper?.findAll('button').find((item) => item.text() === label)
  if (!result) throw new Error(`Missing button ${label}`)
  return result
}
async function enterEditing() {
  await button('Edit page').trigger('click')
  await flushPromises()
}

describe('landing website editing through the CMS session', () => {
  it('previews a never-published page whose publishedData is null', async () => {
    Object.assign(entry.value, {
      publishedData: null,
      localeData: { ...entry.value.localeData, published: null, publishedPath: null },
    })
    await openEditor()
    expect(wrapper!.find('h1').text()).toBe('Working title')
    await button('Published').trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain('English is not published yet')
    expect(wrapper!.text()).not.toContain('Unavailable')
  })
  it('keeps public rendering free of editing controls and resolves safe image URLs', () => {
    wrapper = mount(LandingPage, {
      props: {
        content: landing_content({
          title: 'Public',
          hero_image: 'https://assets.example/a.jpg',
          hero_alt: 'A valley',
        }),
      },
    })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('img').attributes('alt')).toBe('A valley')
    expect(landing_link('javascript:alert(1)')).toBeUndefined()
    expect(landing_image('asset-id')).toBeUndefined()
    expect(landing_link('//attacker.example')).toBeUndefined()
  })

  it('flushes local intent before Published, retains unrelated persisted fields, and uses published assets', async () => {
    await openEditor()
    await enterEditing()
    await wrapper!.get('textarea[aria-label="Headline"]').setValue('Local headline')
    await button('Published').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0].patch.locales?.en?.values).toMatchObject({
      title: 'Local headline',
      custom: 'preserve',
    })
    expect(save.mock.calls[0]?.[0].concurrency.base.locales?.en?.values?.title).toBe(
      'Working title',
    )
    expect(wrapper!.find('h1').text()).toBe('Published title')
    expect(wrapper!.get('.landing-photo').attributes('src')).toBe(
      'https://assets.example/published.jpg',
    )
    expect(wrapper!.find('textarea').exists()).toBe(false)
    await button('Working').trigger('click')
    await flushPromises()
    expect(wrapper!.find('h1').text()).toBe('Local headline')
    expect(wrapper!.text()).not.toContain('Live version')
  })

  it('keeps independent shared fields and exposes both values for an actual overlap', async () => {
    await openEditor()
    await enterEditing()
    await wrapper!.get('textarea[aria-label="Headline"]').setValue('My headline')
    entry.value = {
      ...entry.value,
      draftVersion: 2,
      localeData: {
        ...entry.value.localeData,
        draft: {
          ...entry.value.localeData.draft,
          values: { ...entry.value.localeData.draft.values, description: 'Their introduction' },
        },
      },
    }
    await flushPromises()
    expect(wrapper!.get('textarea[aria-label="Introduction"]').element).toHaveProperty(
      'value',
      'Their introduction',
    )
    expect(wrapper!.text()).not.toContain('Keep mine')
    entry.value = {
      ...entry.value,
      draftVersion: 3,
      localeData: {
        ...entry.value.localeData,
        draft: {
          ...entry.value.localeData.draft,
          values: { ...entry.value.localeData.draft.values, title: 'Their headline' },
        },
      },
    }
    await flushPromises()
    expect(wrapper!.text()).toContain('My headline')
    expect(wrapper!.text()).toContain('Their headline')
    await button('Use shared').trigger('click')
    await flushPromises()
    expect(wrapper!.get('textarea[aria-label="Headline"]').element).toHaveProperty(
      'value',
      'Their headline',
    )
  })

  it('keeps unsaved text visible after a failed save and retries the identical request', async () => {
    await openEditor()
    await enterEditing()
    await wrapper!.get('textarea[aria-label="Headline"]').setValue('Keep this text')
    save.mockRejectedValueOnce(new Error('network unavailable'))
    await button('Published').trigger('click')
    await flushPromises()
    expect(wrapper!.get('textarea[aria-label="Headline"]').element).toHaveProperty(
      'value',
      'Keep this text',
    )
    expect(wrapper!.text()).toContain('Your changes couldn’t be saved')
    const sent = save.mock.calls[0]?.[0]
    await button('Retry saving').trigger('click')
    await flushPromises()
    expect(save.mock.calls[1]?.[0]).toEqual(sent)
    expect(wrapper!.text()).toContain('All changes saved')
  })

  it('waits for an acknowledged save before changing language and blocks navigation during composition', async () => {
    await openEditor()
    await enterEditing()
    const title = wrapper!.get('textarea[aria-label="Headline"]')
    await title.setValue('Changed')
    await title.trigger('compositionstart')
    await wrapper!.get('select').setValue('de')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    await title.trigger('compositionend')
    await wrapper!.get('select').setValue('de')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ path: '/preview/landing/entry-1', query: { locale: 'de' } })
  })

  it('publishes only the reviewed locale and invalidates review when another person saves', async () => {
    await openEditor()
    await button('Publish…').trigger('click')
    await flushPromises()
    expect(preview).toHaveBeenCalledWith({
      entryId: 'entry-1',
      locales: ['en'],
      expectedVersion: 1,
    })
    entry.value = { ...entry.value, draftVersion: 2 }
    await flushPromises()
    expect(wrapper!.text()).toContain('The shared version changed')
    expect(wrapper!.findAll('button').some((item) => item.text() === 'Publish English')).toBe(false)
    await button('Review latest changes').trigger('click')
    await flushPromises()
    await button('Publish English').trigger('click')
    await flushPromises()
    expect(publish).toHaveBeenCalledWith({
      entryId: 'entry-1',
      locales: ['en'],
      expectedVersion: 2,
      _confirmationToken: 'review-token',
    })
  })

  it('shows a canonical blocked preview with null confirmation instead of a loading failure', async () => {
    const blocked = buildPreview({
      allowed: false,
      summary: 'This language needs attention before publishing.',
      blockers: [
        { code: 'ENTRY_REQUIRED_FIELD_MISSING', message: 'Add a headline before publishing.' },
      ],
      effects: [
        { kind: 'publication', summary: 'No website changes will be published.', count: null },
      ],
    })
    preview.mockResolvedValueOnce(blocked)
    await openEditor()
    await button('Publish…').trigger('click')
    await flushPromises()
    expect(wrapper!.get('dialog[aria-labelledby="publish-title"]').attributes('open')).toBe('')
    expect(wrapper!.text()).toContain('Add a headline before publishing.')
    expect(wrapper!.text()).not.toContain('response could not be read')
    expect(publish).not.toHaveBeenCalled()
  })

  it('shows a structured server error when publication review is rejected', async () => {
    preview.mockRejectedValueOnce(
      Object.assign(new Error('Convex server error'), {
        data: JSON.stringify({
          code: 'ENTRY_CONCURRENT_EDIT',
          message: 'This page changed. Review the latest working version.',
        }),
      }),
    )
    await openEditor()
    await button('Publish…').trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain('This page changed. Review the latest working version.')
    expect(wrapper!.text()).not.toContain('Convex server error')
  })

  it('uses host-localized German hrefs and keeps an old published slug distinct from a new working slug', async () => {
    entry.value.locale = 'de'
    entry.value.locales[1]!.draftExists = true
    entry.value.localeData.draftPath = '/landing/neue-startseite'
    entry.value.localeData.publishedPath = '/landing/alte-startseite'
    await openEditor()
    expect(wrapper!.text()).toContain('Will publish to /de/landing/neue-startseite')
    expect(localePath).toHaveBeenCalledWith('/landing/neue-startseite', 'de')
    await button('Published').trigger('click')
    await flushPromises()
    const link = wrapper!.findAll('a').find((item) => item.text() === 'Open public page ↗')
    expect(link?.attributes('href')).toBe('/de/landing/alte-startseite')
    expect(localePath).toHaveBeenCalledWith('/landing/alte-startseite', 'de')
    expect(save).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('offers the real Studio media route and saves pending work before navigating a new tab', async () => {
    const opening = vi.spyOn(window, 'open').mockReturnValue(null)
    await openEditor()
    await enterEditing()
    await wrapper!.get('textarea[aria-label="Headline"]').setValue('Save before media')
    await button('Choose image').trigger('click')
    await flushPromises()
    const link = wrapper!.get('a[href="/studio/assets"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    await link.trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0].patch.locales?.en?.values?.title).toBe('Save before media')
    expect(wrapper!.text()).toContain('Changes saved. Select Open media library again')
    opening.mockRestore()
  })

  it('uses request-review for an editor without publisher permission', async () => {
    entry.value._can.publish = false
    await openEditor()
    expect(wrapper!.findAll('button').some((item) => item.text() === 'Publish…')).toBe(false)
    await button('Request review').trigger('click')
    await flushPromises()
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'entry-1', locales: ['en'], expectedVersion: 1 }),
    )
    expect(publish).not.toHaveBeenCalled()
  })

  it('selects an existing CMS image id and localized description, not an arbitrary image URL', async () => {
    await openEditor()
    await enterEditing()
    await button('Choose image').trigger('click')
    await flushPromises()
    await button('Landscape.jpg').trigger('click')
    await flushPromises()
    await button('Preview').trigger('click')
    await flushPromises()
    expect(save.mock.calls[0]?.[0].patch.locales?.en?.values).toMatchObject({
      hero_image: 'asset-new',
      hero_alt: 'A green valley',
    })
    expect(wrapper!.get('.landing-photo').attributes('src')).toBe('https://assets.example/new.jpg')
  })

  it('shows missing languages explicitly and creates one without editing the source fallback', async () => {
    entry.value.locale = 'de'
    await openEditor()
    expect(wrapper!.text()).toContain('Add German')
    expect(wrapper!.find('.landing-page').exists()).toBe(false)
    await button('Start blank').trigger('click')
    await flushPromises()
    expect(create).toHaveBeenCalledWith({
      entryId: 'entry-1',
      locale: 'de',
      source: { kind: 'blank' },
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('does not display a protected page after an access error', async () => {
    await openEditor()
    error.value = new Error('Access denied')
    await flushPromises()
    expect(wrapper!.find('.landing-page').exists()).toBe(false)
    expect(wrapper!.text()).toContain('This page is unavailable')
  })
})
