/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import { api, createCtx, currentDraftVersion, seedOwner } from '../helpers'

describe('integration: full entry lifecycle', () => {
  it('synced collection contract -> create entry -> save draft -> publish -> read via public API -> unpublish', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    // Seed CMS settings
    await ctx.seed(
      'cmsSettings' as never,
      {
        key: 'site',
        locales: [{ code: 'en', label: 'English', isDefault: true }],
        webhooks: [],
        updatedBy: 'owner-1',
        updatedAt: Date.now(),
      } as never,
    )

    // Seed the synced code-defined collection contract.
    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'articles',
        label: { en: 'Articles' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/articles',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true },
          {
            key: 'description',
            type: 'textarea',
            localized: true,
            searchable: true,
          },
        ],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    // Create entry
    const entryId = await owner.mutation(api.editor.createEntry, {
      collection: 'articles',
      slug: 'my-first-article',
      localized: { title: 'My First Article' },
    })

    expect(typeof entryId).toBe('string')

    // Verify draft state via editor API
    const draftEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(draftEntry?.status).toBe('draft')
    expect(draftEntry?.data.title).toBe('My First Article')
    expect(draftEntry?.path).toBe('/articles/my-first-article')

    // Save a shared draft change
    const saveResult = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          shared: { featured: true },
        },
      },
    })
    expect(saveResult.draftVersion).toBe(2)

    // Save a localized draft change
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          en: {
            values: {
              title: 'My First Article',
              description: 'An introductory article',
            },
          },
        },
      },
    })

    // Verify the entry is not yet visible via public API
    const prePublishResult = await ctx.raw.query(api.public.page, {
      collection: 'articles',
      path: '/articles/my-first-article',
      locale: 'en',
    })
    expect(prePublishResult.status).toBe('not-found')

    // Publish
    const publishResult = await owner.mutation(api.entries.publish.publishEntryTransportExecute, {
      entryId,
      expectedVersion: await currentDraftVersion(owner, entryId),
      locales: ['en'],
    })
    expect(publishResult.dirtyLocales).toEqual([])
    expect(typeof publishResult.versionId).toBe('string')

    // Read via public API
    const publicResult = await ctx.raw.query(api.public.page, {
      collection: 'articles',
      path: '/articles/my-first-article',
      locale: 'en',
    })
    expect(publicResult.status).toBe('found')
    expect(publicResult.page?.title).toBe('My First Article')
    expect(publicResult.page?.data.description).toBe('An introductory article')
    expect(publicResult.seo?.description).toBe('An introductory article')
    expect(publicResult.page?.collection).toBe('articles')

    // Verify in list
    const listResult = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 10,
      cursor: null,
    })
    expect(listResult.entries).toHaveLength(1)
    expect(listResult.entries[0]?.title).toBe('My First Article')

    // Unpublish
    await owner.mutation(api.entries.publish.unpublishEntryTransportExecute, { entryId })

    // Verify no longer visible via public API
    const postUnpublishResult = await ctx.raw.query(api.public.page, {
      collection: 'articles',
      path: '/articles/my-first-article',
      locale: 'en',
    })
    expect(postUnpublishResult.status).toBe('not-found')

    // Verify entry still exists as draft in editor
    const editorEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(editorEntry?.status).toBe('draft')
  })
})

describe('integration: multi-locale with fallback', () => {
  it('create entry -> add locale content -> publish -> read with fallback', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    // Seed multi-locale settings with fallback chain: de-CH -> de -> en
    await ctx.seed(
      'cmsSettings' as never,
      {
        key: 'site',
        locales: [
          { code: 'en', label: 'English', isDefault: true },
          { code: 'de', label: 'German', fallback: 'en' },
          { code: 'de-CH', label: 'Swiss German', fallback: 'de' },
        ],
        webhooks: [],
        updatedBy: 'owner-1',
        updatedAt: Date.now(),
      } as never,
    )

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'blog',
        label: { en: 'Blog' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/blog',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de', 'de-CH'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    // Create entry in English
    const entryId = await owner.mutation(api.editor.createEntry, {
      collection: 'blog',
      slug: 'welcome',
      localized: { title: 'Welcome' },
      locale: 'en',
    })

    // Add German locale variant and set its title
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId,
      locale: 'de',
    })
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          de: {
            values: { title: 'Willkommen' },
          },
        },
      },
    })

    // Publish both locales
    await owner.mutation(api.entries.publish.publishEntryTransportExecute, {
      entryId,
      expectedVersion: await currentDraftVersion(owner, entryId),
      locales: ['en', 'de'],
    })

    // Read English (direct match)
    const enResult = await ctx.raw.query(api.public.page, {
      collection: 'blog',
      path: '/blog/welcome',
      locale: 'en',
    })
    expect(enResult.status).toBe('found')
    expect(enResult.page?.title).toBe('Welcome')
    expect(enResult.page?.locale.resolved).toBe('en')

    // Read German (direct match)
    const deResult = await ctx.raw.query(api.public.page, {
      collection: 'blog',
      path: '/blog/welcome',
      locale: 'de',
    })
    expect(deResult.status).toBe('found')
    expect(deResult.page?.title).toBe('Willkommen')
    expect(deResult.page?.locale.resolved).toBe('de')

    // Read Swiss German. Route-backed public reads do not synthesize fallback-only routes.
    const deChResult = await ctx.raw.query(api.public.page, {
      collection: 'blog',
      path: '/blog/welcome',
      locale: 'de-CH',
    })
    expect(deChResult.status).toBe('not-found')
    expect(deChResult.page).toBeNull()
  })
})
