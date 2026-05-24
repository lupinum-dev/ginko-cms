/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createMigrationsBridge } from '../../packages/cms/src/bridge/migrations.js'
import { createCtx, seedOwner, seedSettings, seedEditorFixture } from './entries/helpers'

const api = anyApi
type MigrationBridgeOptions = Parameters<typeof createMigrationsBridge>[0]
type VisibilityProbe = {
  listContentMigrationEntries: { visibility: string }
  applyContentMigrationEntries: { visibility: string }
}

describe('explicit content migrations', () => {
  it('exposes only internal generated bridge functions', () => {
    const bridge = createMigrationsBridge({
      component: {
        query: (definition: unknown) => ({ visibility: 'public', definition }),
        mutation: (definition: unknown) => ({ visibility: 'public', definition }),
        internalQuery: (definition: unknown) => ({ visibility: 'internal', definition }),
        internalMutation: (definition: unknown) => ({ visibility: 'internal', definition }),
      } as unknown as MigrationBridgeOptions['component'],
      components: {
        listContentMigrationEntriesInternal: {},
        applyContentMigrationEntriesInternal: {},
      },
    }) as unknown as VisibilityProbe

    expect(bridge.listContentMigrationEntries.visibility).toBe('internal')
    expect(bridge.applyContentMigrationEntries.visibility).toBe('internal')
  })

  it('reads draft snapshots and applies transformed entries through the draft writer', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const page = await ctx.raw.query(api.migrations.listContentMigrationEntriesInternal, {
      collection: 'posts',
      cursor: null,
      limit: 10,
    })

    expect(page).toMatchObject({
      isDone: true,
      page: [
        expect.objectContaining({
          collection: 'posts',
          draftVersion: 1,
          shared: {},
          locales: {
            en: expect.objectContaining({
              values: { title: 'Hello world' },
              bodyMdc: '',
            }),
          },
        }),
      ],
    })

    const entry = page.page[0]
    const migrated = {
      ...entry,
      shared: { badge: 'new' },
      locales: {
        ...entry.locales,
        en: {
          ...entry.locales.en,
          values: {
            ...entry.locales.en.values,
            title: 'Hello migrated',
          },
        },
      },
    }

    const result = await ctx.raw.mutation(api.migrations.applyContentMigrationEntriesInternal, {
      migrationId: '2026-test',
      entries: [migrated],
    })

    expect(result).toEqual({ migrationId: '2026-test', changed: 1, unchanged: 0 })

    const after = await ctx.raw.query(api.migrations.listContentMigrationEntriesInternal, {
      collection: 'posts',
      cursor: null,
      limit: 10,
    })
    expect(after.page[0]).toMatchObject({
      draftVersion: 2,
      shared: { badge: 'new' },
      locales: {
        en: expect.objectContaining({
          values: { title: 'Hello migrated' },
        }),
      },
    })

    await expect(
      ctx.raw.mutation(api.migrations.applyContentMigrationEntriesInternal, {
        migrationId: '2026-test',
        entries: [migrated],
      }),
    ).rejects.toThrow('expectedDraftVersion=1')
  })
})
