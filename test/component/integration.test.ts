/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import {
  api,
  createCtx,
  currentDraftVersion,
  publishEntry,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
  unpublishEntry,
} from '../helpers'

describe('integration: canonical entry lifecycle', () => {
  it('installs contract, edits a draft, publishes through one operation, and unpublishes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'my-first-article',
      localized: { title: 'My First Article' },
    })

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
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

    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'posts',
        path: '/posts/my-first-article',
        locale: 'en',
      }),
    ).resolves.toMatchObject({ status: 'not-found', page: null })

    await publishEntry(owner, entryId)
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'posts',
        path: '/posts/my-first-article',
        locale: 'en',
      }),
    ).resolves.toMatchObject({
      status: 'found',
      page: {
        collection: 'posts',
        title: 'My First Article',
        data: { title: 'My First Article', description: 'An introductory article' },
      },
    })
    await expect(
      ctx.raw.query(api.public.list, {
        collection: 'posts',
        locale: 'en',
        limit: 10,
        cursor: null,
      }),
    ).resolves.toMatchObject({ entries: [expect.objectContaining({ title: 'My First Article' })] })

    await unpublishEntry(owner, entryId)
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect((await ctx.readAll('entries'))[0]).toMatchObject({
      lifecycle: 'active',
      activePublications: [],
    })
  })

  it('activates localized publications independently on localized route mounts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'welcome',
      localized: { title: 'Welcome' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, { entryId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: { locales: { de: { values: { title: 'Willkommen' } } } },
    })

    await publishEntry(owner, entryId, ['en'])
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'posts',
        path: '/beitraege/welcome',
        locale: 'de',
      }),
    ).resolves.toMatchObject({ status: 'not-found' })

    await publishEntry(owner, entryId, ['de'])
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'posts',
        path: '/posts/welcome',
        locale: 'en',
      }),
    ).resolves.toMatchObject({ status: 'found', page: { title: 'Welcome' } })
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'posts',
        path: '/beitraege/welcome',
        locale: 'de',
      }),
    ).resolves.toMatchObject({ status: 'found', page: { title: 'Willkommen' } })
  })
})
