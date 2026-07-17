import { describe, expect, it, vi } from 'vitest'

import {
  inspectPublicEntryReachability,
  publicPathForPlacement,
  resolvePublicRedirect,
  resolvePublicRoute,
  resolvePublicTreePath,
  validatePublicPlacement,
  validatePublicPath,
  validatePublicRedirectCandidate,
} from '../../../packages/convex/src/entries/workflow/publicTree'

type TestRow = {
  _id: string
  entryId: string
  collection: string
  locale: string
  parentEntryId: string | null
  slug: string
}

type TestRedirect = {
  _id: string
  collection: string
  locale: string
  state: 'active' | 'retired'
  kind: 'exact' | 'prefix'
  fromPath: string
  targetEntryId: string
  statusCode: number
}

function createRoutingCtx(input: { rows: TestRow[]; redirects?: TestRedirect[] }) {
  const calls: Array<{ table: string; index: string; conditions: Record<string, unknown> }> = []
  const query = vi.fn((table: string) => ({
    withIndex(index: string, configure: (q: unknown) => unknown) {
      const conditions: Record<string, unknown> = {}
      const q = {
        eq(field: string, value: unknown) {
          conditions[field] = value
          return q
        },
      }
      configure(q)
      calls.push({ table, index, conditions })
      const source = table === 'publicEntries' ? input.rows : (input.redirects ?? [])
      const rows = source.filter((row) =>
        Object.entries(conditions).every(
          ([field, expected]) => (row as Record<string, unknown>)[field] === expected,
        ),
      )
      return {
        collect: async () => rows,
        take: async (limit: number) => rows.slice(0, limit),
      }
    },
  }))
  return {
    ctx: { db: { query } } as never,
    calls,
  }
}

function treeRows(): TestRow[] {
  return [
    {
      _id: 'public-guide',
      entryId: 'guide',
      collection: 'docs',
      locale: 'en',
      parentEntryId: null,
      slug: 'guide',
    },
    {
      _id: 'public-install',
      entryId: 'install',
      collection: 'docs',
      locale: 'en',
      parentEntryId: 'guide',
      slug: 'install',
    },
    {
      _id: 'public-api',
      entryId: 'api',
      collection: 'docs',
      locale: 'en',
      parentEntryId: 'guide',
      slug: 'api',
    },
  ]
}

describe('structural public tree', () => {
  it('walks the indexed parent/slug tree and computes the same current path from ancestry', async () => {
    const { ctx, calls } = createRoutingCtx({ rows: treeRows() })
    const route = await resolvePublicTreePath(ctx, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/guide/install',
      options: { pathPrefix: '/docs' },
    })

    expect(route?.row.entryId).toBe('install')
    expect(route?.chain.map((row) => row.entryId)).toEqual(['guide', 'install'])
    expect(
      await inspectPublicEntryReachability(ctx, {
        collection: 'docs',
        locale: 'en',
        entryId: 'install' as never,
        options: { pathPrefix: '/docs' },
      }),
    ).toMatchObject({ reachable: true, path: '/docs/guide/install' })
    expect(
      await publicPathForPlacement(ctx, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: 'guide' as never,
        slug: 'new-page',
        options: { pathPrefix: '/docs' },
      }),
    ).toBe('/docs/guide/new-page')

    expect(calls.filter((call) => call.index === 'by_collection_locale_parent_slug')).toHaveLength(
      2,
    )
    expect(calls.every((call) => call.table === 'publicEntries')).toBe(true)
  })

  it('marks a published row unreachable when an ancestor is absent', async () => {
    const orphan = treeRows()[1]!
    const { ctx } = createRoutingCtx({ rows: [orphan] })

    await expect(
      inspectPublicEntryReachability(ctx, {
        collection: 'docs',
        locale: 'en',
        entryId: 'install' as never,
      }),
    ).resolves.toMatchObject({
      reachable: false,
      reason: 'missing-parent',
      problemEntryId: 'guide',
    })
  })

  it('rejects a prospective placement below the entry own descendant', async () => {
    const { ctx } = createRoutingCtx({ rows: treeRows() })
    const issues = await validatePublicPlacement(ctx, {
      collection: 'docs',
      locale: 'en',
      entryId: 'guide' as never,
      parentEntryId: 'install' as never,
      slug: 'guide',
    })

    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'parent-cycle', entryId: 'install' }),
    )
  })

  it('resolves exact and prefix redirects directly to the target tree without following chains', async () => {
    const redirects: TestRedirect[] = [
      {
        _id: 'exact-legacy',
        collection: 'docs',
        locale: 'en',
        state: 'active',
        kind: 'exact',
        fromPath: '/legacy-install',
        targetEntryId: 'install',
        statusCode: 308,
      },
      {
        _id: 'prefix-old',
        collection: 'docs',
        locale: 'en',
        state: 'active',
        kind: 'prefix',
        fromPath: '/old-guide',
        targetEntryId: 'guide',
        statusCode: 308,
      },
      // This stale redirect source collides with the target route. Resolution
      // still stops after the entry-ID target and never follows it.
      {
        _id: 'must-not-chain',
        collection: 'docs',
        locale: 'en',
        state: 'active',
        kind: 'exact',
        fromPath: '/docs/guide/install',
        targetEntryId: 'api',
        statusCode: 308,
      },
    ]
    const { ctx } = createRoutingCtx({ rows: treeRows(), redirects })

    await expect(
      resolvePublicRedirect(ctx, {
        collection: 'docs',
        locale: 'en',
        path: '/legacy-install',
        options: { pathPrefix: '/docs' },
      }),
    ).resolves.toMatchObject({ kind: 'redirect', targetPath: '/docs/guide/install' })
    await expect(
      resolvePublicRedirect(ctx, {
        collection: 'docs',
        locale: 'en',
        path: '/old-guide/install',
        options: { pathPrefix: '/docs' },
      }),
    ).resolves.toMatchObject({ kind: 'redirect', targetPath: '/docs/guide/install' })
    await expect(
      resolvePublicRoute(ctx, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/guide/install',
        options: { pathPrefix: '/docs' },
      }),
    ).resolves.toMatchObject({ kind: 'entry', row: { entryId: 'install' } })
  })

  it('rejects redirect collisions and a prefix target inside its own source', async () => {
    const redirects: TestRedirect[] = [
      {
        _id: 'existing',
        collection: 'docs',
        locale: 'en',
        state: 'active',
        kind: 'exact',
        fromPath: '/legacy',
        targetEntryId: 'api',
        statusCode: 308,
      },
    ]
    const { ctx } = createRoutingCtx({ rows: treeRows(), redirects })

    const collision = await validatePublicRedirectCandidate(ctx, {
      collection: 'docs',
      locale: 'en',
      kind: 'exact',
      fromPath: '/legacy',
      targetEntryId: 'install' as never,
      options: { pathPrefix: '/docs' },
    })
    expect(collision.ok).toBe(false)
    expect(collision.issues.map((issue) => issue.code)).toContain('source-redirect-collision')

    const loop = await validatePublicRedirectCandidate(ctx, {
      collection: 'docs',
      locale: 'en',
      kind: 'prefix',
      fromPath: '/docs',
      targetEntryId: 'guide' as never,
      options: { pathPrefix: '/docs' },
    })
    expect(loop.ok).toBe(false)
    expect(loop.issues.map((issue) => issue.code)).toContain('prefix-loop')
  })

  it('rejects ambiguous and traversal-like route spellings', () => {
    expect(validatePublicPath('/docs//install').ok).toBe(false)
    expect(validatePublicPath('/docs/%2e%2e/install').ok).toBe(false)
    expect(validatePublicPath('/docs/%2Fetc').ok).toBe(false)
    expect(validatePublicPath('/docs/install?preview=1').ok).toBe(false)
  })
})
