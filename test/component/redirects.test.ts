/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import {
  bumpRouteGeneration,
  readRouteGeneration,
  readRouteInventoryGeneration,
} from '../../packages/convex/src/entries/workflow/routeGeneration'
import { readRedirectInventorySourcePage } from '../../packages/convex/src/redirects/inventory'
import { createCtx, publishEntry, seedMember, seedOwner, seedSettings } from '../helpers'

const api = anyApi

describe('redirect inventory and guarded retirement', () => {
  it('keeps one inventory generation across independently changing collection/locale scopes', async () => {
    const ctx = createCtx()
    const expected = [
      { collection: 'blog', locale: 'en', generation: 4 },
      { collection: 'blog', locale: 'de', generation: 3 },
      { collection: 'docs', locale: 'en', generation: 9 },
      { collection: 'docs', locale: 'de', generation: 7 },
    ]

    const result = await ctx.raw.run(async (inner) => {
      for (const scope of expected) {
        for (let value = 0; value < scope.generation; value++) {
          await bumpRouteGeneration(inner, scope.collection, scope.locale, value + 1)
        }
      }
      return {
        scopes: await Promise.all(
          expected.map(async (scope) => ({
            collection: scope.collection,
            locale: scope.locale,
            generation: await readRouteGeneration(inner, scope.collection, scope.locale),
          })),
        ),
        inventory: await readRouteInventoryGeneration(inner),
      }
    })

    expect(result.scopes).toEqual(expected)
    expect(result.inventory).toBe(23)
  })

  it('[WEB-07] blocks path reuse until retirement and records actor, route fence, activity, and old/new revalidation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const targetEntryId = await owner.createEntry({
      collection: 'docs',
      slug: 'destination',
      localized: { title: 'Destination' },
    })
    await publishEntry(owner, targetEntryId)
    const candidateEntryId = await owner.createEntry({
      collection: 'docs',
      slug: 'legacy',
      localized: { title: 'Reused legacy route' },
    })

    const createdAt = Date.now()
    const redirectId = 'redirect:legacy'
    const redirectDocId = await ctx.seed('redirects', {
      redirectId,
      collection: 'docs',
      locale: 'en',
      kind: 'exact',
      fromPath: '/docs/legacy',
      targetEntryId,
      state: 'active',
      statusCode: 308,
      source: 'manual',
      operationId: 'test:create-redirect',
      createdBy: 'owner-1',
      createdAt,
      retiredBy: null,
      retiredAt: null,
      updatedAt: createdAt,
    })

    const inventory = await ctx.asCmsUser('viewer-1').query(api.editor.listRedirects, {
      collection: 'docs',
      locale: 'en',
      state: 'active',
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(inventory).toMatchObject({
      isDone: true,
      continueCursor: null,
      page: [
        {
          id: redirectId,
          fromPath: '/docs/legacy',
          targetEntryId,
          targetPath: '/docs/destination',
          targetReachable: true,
          state: 'active',
        },
      ],
    })

    const blockedPublish = await owner.mutation(api.entries.publish.previewPublishEntryOperation, {
      entryId: candidateEntryId,
      expectedVersion: 1,
      locales: ['en'],
    })
    expect(blockedPublish.allowed).toBe(false)
    expect(blockedPublish.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('/docs/legacy') }),
      ]),
    )

    const preview = await owner.mutation(api.editor.previewRetireRedirectOperation, {
      redirectId,
    })
    expect(preview).toMatchObject({
      allowed: true,
      details: {
        id: redirectId,
        fromPath: '/docs/legacy',
        targetPath: '/docs/destination',
      },
      confirmation: { token: expect.any(String), expiresAt: expect.any(Number) },
    })
    const executed = await owner.mutation(api.editor.retireRedirectOperationExecute, {
      redirectId,
      _confirmationToken: preview.confirmation.token,
    })
    expect(executed).toMatchObject({
      status: 'applied',
      value: {
        redirectId,
        fromPath: '/docs/legacy',
        targetPath: '/docs/destination',
        retiredAt: expect.any(Number),
      },
    })

    const redirect = (await ctx.readAll('redirects')).find((row) => row._id === redirectDocId)
    expect(redirect).toMatchObject({
      state: 'retired',
      retiredBy: 'owner-1',
      retiredAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    expect(redirect!.retiredAt).toBeGreaterThan(createdAt)

    expect(await ctx.readAll('routeGenerations')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'docs', locale: 'en', generation: 2 }),
        expect.objectContaining({ collection: '*', locale: '*', generation: 2 }),
      ]),
    )
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'redirect.retired',
          appIdentityId: 'owner-1',
          collection: 'docs',
          locale: 'en',
          detail: expect.objectContaining({
            redirectId,
            fromPath: '/docs/legacy',
            targetPath: '/docs/destination',
          }),
        }),
      ]),
    )
    const retirementEvent = (await ctx.readAll('outboxEvents')).find(
      (row) => (row.payload as Record<string, unknown>).reason === 'redirect-retired',
    )
    expect(retirementEvent).toMatchObject({
      paths: ['/docs/legacy', '/docs/destination'],
      tags: expect.arrayContaining([
        'route:/docs/legacy',
        'route:/docs/destination',
        'collection:docs',
        'nav:docs:en',
        'search:en',
        'sitemap',
      ]),
      payload: expect.objectContaining({
        redirectId,
        sourcePath: '/docs/legacy',
        targetPath: '/docs/destination',
      }),
    })

    const activeAfterRetirement = await owner.query(api.editor.listRedirects, {
      collection: 'docs',
      locale: 'en',
      state: 'active',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(activeAfterRetirement.page).toEqual([])
    const retiredAfterRetirement = await owner.query(api.editor.listRedirects, {
      collection: 'docs',
      locale: 'en',
      state: 'retired',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(retiredAfterRetirement.page).toEqual([
      expect.objectContaining({ id: redirectId, state: 'retired', retiredBy: 'owner-1' }),
    ])

    const reusablePublish = await owner.mutation(api.entries.publish.previewPublishEntryOperation, {
      entryId: candidateEntryId,
      expectedVersion: 1,
      locales: ['en'],
    })
    expect(reusablePublish.allowed).toBe(true)
    await publishEntry(owner, candidateEntryId)
    expect(await ctx.readAll('publicEntries')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: candidateEntryId, locale: 'en', slug: 'legacy' }),
      ]),
    )
  })

  it('pages equal-updatedAt redirects with a scope-bound explicit keyset cursor', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const targetEntryId = await owner.createEntry({
      collection: 'docs',
      slug: 'keyset-target',
      localized: { title: 'Keyset target' },
    })
    await publishEntry(owner, targetEntryId)

    const updatedAt = 42
    const redirectIds = ['a', 'b', 'c'].map((suffix) => `redirect:keyset:${suffix}`)
    await ctx.raw.run(async (inner) => {
      for (const suffix of ['a', 'b', 'c']) {
        await inner.db.insert('redirects', {
          redirectId: `redirect:keyset:${suffix}`,
          collection: 'docs',
          locale: 'en',
          kind: 'exact',
          fromPath: `/docs/legacy-${suffix}`,
          targetEntryId,
          state: 'active',
          statusCode: 308,
          source: 'manual',
          operationId: `test:keyset:${suffix}`,
          createdBy: 'owner-1',
          createdAt: updatedAt,
          retiredBy: null,
          retiredAt: null,
          updatedAt,
        })
      }
    })
    const seededRedirects = (await ctx.readAll('redirects')).filter((row) =>
      redirectIds.includes(row.redirectId),
    )
    expect(new Set(seededRedirects.map((row) => row.updatedAt))).toEqual(new Set([updatedAt]))

    const listedIds: string[] = []
    let cursor: string | null = null
    do {
      const page = await owner.query(api.editor.listRedirects, {
        collection: 'docs',
        locale: 'en',
        state: 'active',
        paginationOpts: { cursor, numItems: 1 },
      })
      listedIds.push(...page.page.map((redirect: { id: string }) => redirect.id))
      cursor = page.continueCursor
    } while (cursor)

    expect(listedIds).toHaveLength(3)
    expect(new Set(listedIds)).toEqual(new Set(redirectIds))

    const firstPage = await owner.query(api.editor.listRedirects, {
      collection: 'docs',
      locale: 'en',
      state: 'active',
      paginationOpts: { cursor: null, numItems: 1 },
    })
    await expect(
      owner.query(api.editor.listRedirects, {
        collection: 'docs',
        locale: 'en',
        state: 'retired',
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
      }),
    ).rejects.toThrow('Invalid redirect inventory cursor')
  })

  it('does not lose or duplicate equal-updatedAt and equal-creationTime rows', async () => {
    const rows = ['a', 'b', 'c'].map((suffix) => ({
      _id: `storage-${suffix}`,
      _creationTime: 100,
      redirectId: `redirect:${suffix}`,
      collection: 'docs',
      locale: 'en',
      state: 'active' as const,
      updatedAt: 42,
    }))
    const query = vi.fn(() => ({
      withIndex(
        _index: string,
        configure: (builder: {
          eq: (field: string, value: unknown) => unknown
          lt: (field: string, value: unknown) => unknown
        }) => unknown,
      ) {
        const predicates: Array<(row: (typeof rows)[number]) => boolean> = []
        const builder = {
          eq(field: string, value: unknown) {
            predicates.push((row) => Reflect.get(row, field) === value)
            return builder
          },
          lt(field: string, value: unknown) {
            predicates.push((row) => String(Reflect.get(row, field)) < String(value))
            return builder
          },
        }
        configure(builder)
        const matching = rows
          .filter((row) => predicates.every((predicate) => predicate(row)))
          .sort(
            (left, right) =>
              right.updatedAt - left.updatedAt || right.redirectId.localeCompare(left.redirectId),
          )
        const ordered = {
          order: () => ordered,
          take: async (limit: number) => matching.slice(0, limit),
        }
        return ordered
      },
    }))
    const ctx = { db: { query } } as never
    const listed: string[] = []
    let cursor: Parameters<typeof readRedirectInventorySourcePage>[1]['cursor'] = null
    do {
      const page = await readRedirectInventorySourcePage(ctx, {
        collection: 'docs',
        locale: 'en',
        state: 'active',
        cursor,
        limit: 1,
      })
      listed.push(...page.page.map((row) => row.redirectId))
      cursor = page.continueCursor ? JSON.parse(page.continueCursor) : null
    } while (cursor)

    expect(new Set(rows.map((row) => row.updatedAt))).toEqual(new Set([42]))
    expect(new Set(rows.map((row) => row._creationTime))).toEqual(new Set([100]))
    expect(listed).toEqual(['redirect:c', 'redirect:b', 'redirect:a'])
    expect(new Set(listed).size).toBe(rows.length)
  })
})
