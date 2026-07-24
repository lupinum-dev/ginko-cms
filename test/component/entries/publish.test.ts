/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  computePublishDraftHash,
  publishCurrentDraft,
} from '../../../packages/convex/src/entries/workflow/commands'
import {
  MAX_MDC_BODY_BYTES,
  MAX_PUBLIC_LIST_PAYLOAD_BYTES,
} from '../../../packages/convex/src/lib/contentLimits'
import {
  createCtx,
  currentDraftVersion,
  previewPublishEntryWithArgs,
  publishEntry,
  seedEditorFixture,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
  unpublishEntry,
} from './helpers'

const api = anyApi

function publicRowFor(rows: Array<Record<string, unknown>>, entryId: string, locale: string) {
  return rows.find((row) => row.entryId === entryId && row.locale === locale)
}

describe('canonical publication lifecycle', () => {
  it('[PUB-09] unpublishes one locale atomically without affecting another, then removes all remaining public discovery rows', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { de: { values: { title: 'Hallo Welt' } } } },
    })
    await publishEntry(owner, entryId, ['en', 'de'])

    await unpublishEntry(owner, entryId, ['en'])
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({ entryId, locale: 'de' }),
    ])
    expect(await ctx.readAll('publicSearchEntries')).toEqual([
      expect.objectContaining({ entryId, locale: 'de' }),
    ])
    expect((await ctx.readAll('entries'))[0]).toMatchObject({
      activePublications: [expect.objectContaining({ locale: 'de' })],
    })
    expect((await ctx.readAll('entryRevisions')).at(-1)).toMatchObject({
      kind: 'unpublish',
      affectedLocales: ['en'],
    })

    await unpublishEntry(owner, entryId, ['de'])
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect((await ctx.readAll('entries'))[0]).toMatchObject({ activePublications: [] })
  })

  it('enforces the exact 64 KiB UTF-8 body boundary in drafts and publish previews', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const exactBody = 'é'.repeat(MAX_MDC_BODY_BYTES / 2)

    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: await currentDraftVersion(owner, entryId),
        patch: { locales: { en: { bodyMdc: exactBody } } },
      }),
    ).resolves.toMatchObject({ draftVersion: 2 })

    const oversizedBody = `${exactBody}x`
    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: await currentDraftVersion(owner, entryId),
        patch: { locales: { en: { bodyMdc: oversizedBody } } },
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_BODY_TOO_LARGE')

    await ctx.raw.run(async (inner) => {
      const draft = await inner.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (query) =>
          query.eq('entryId', entryId as never).eq('locale', 'en'),
        )
        .unique()
      await inner.db.patch(draft!._id, { bodyMdc: oversizedBody })
    })
    const preview = await previewPublishEntryWithArgs(owner, {
      entryId,
      expectedVersion: await currentDraftVersion(owner, entryId),
      locales: ['en'],
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ENTRY_BODY_TOO_LARGE' })]),
    )
  })

  it('returns typed publish blockers before oversized derived or revision documents are written', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const payloadEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'oversized-public-payload',
      localized: {
        title: 'Oversized public payload',
        description: 'x'.repeat(MAX_PUBLIC_LIST_PAYLOAD_BYTES),
      },
    })
    const payloadPreview = await previewPublishEntryWithArgs(owner, {
      entryId: payloadEntryId,
      expectedVersion: await currentDraftVersion(owner, payloadEntryId),
      locales: ['en'],
    })
    expect(payloadPreview.allowed).toBe(false)
    expect(payloadPreview.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PUBLIC_PROJECTION_TOO_LARGE' })]),
    )

    const revisionEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'oversized-revision',
      localized: { title: 'Oversized revision' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: revisionEntryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await ctx.raw.run(async (inner) => {
      const rows = await inner.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (query) => query.eq('entryId', revisionEntryId as never))
        .collect()
      for (const row of rows) {
        await inner.db.patch(row._id, {
          values: { title: `${row.locale} oversized revision`, description: 'y'.repeat(530_000) },
        })
      }
    })
    const revisionPreview = await previewPublishEntryWithArgs(owner, {
      entryId: revisionEntryId,
      expectedVersion: await currentDraftVersion(owner, revisionEntryId),
      locales: ['en', 'de'],
    })
    expect(revisionPreview.allowed).toBe(false)
    expect(revisionPreview.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'REVISION_DOCUMENT_TOO_LARGE' })]),
    )
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('[LOC-04][PUB-07][PUB-08] publishes a new locale independently, retains the prior live revision during edits, and atomically replaces it on republish', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { de: { values: { title: 'Hallo Welt' } } } },
    })

    const enPublish = await publishEntry(owner, entryId, ['en'])
    const publicAfterEn = await ctx.readAll('publicEntries')
    const enRow = publicRowFor(publicAfterEn, entryId, 'en')!
    expect(enRow).toMatchObject({
      entryId,
      collection: 'posts',
      locale: 'en',
      revisionId: enPublish.versionId,
      data: expect.objectContaining({ title: 'Hello world' }),
    })
    expect(enRow).not.toHaveProperty('bodyAst')
    expect(publicRowFor(publicAfterEn, entryId, 'de')).toBeUndefined()

    const dePublish = await publishEntry(owner, entryId, ['de'])
    const publicAfterDe = await ctx.readAll('publicEntries')
    expect(publicRowFor(publicAfterDe, entryId, 'en')).toEqual(enRow)
    expect(publicRowFor(publicAfterDe, entryId, 'de')).toMatchObject({
      revisionId: dePublish.versionId,
      data: expect.objectContaining({ title: 'Hallo Welt' }),
    })

    const entryBeforeSharedEdit = (await ctx.readAll('entries'))[0]!
    expect(entryBeforeSharedEdit.activePublications).toEqual([
      expect.objectContaining({ locale: 'de', revisionId: dePublish.versionId }),
      expect.objectContaining({ locale: 'en', revisionId: enPublish.versionId }),
    ])
    const publicBeforeSharedEdit = structuredClone(publicAfterDe)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entryBeforeSharedEdit.draftVersion,
      patch: { shared: { shared: { featured: true } } },
    })
    expect(await ctx.readAll('publicEntries')).toEqual(publicBeforeSharedEdit)

    const enRepublish = await publishEntry(owner, entryId, ['en'])
    const entryAfterEnRepublish = (await ctx.readAll('entries'))[0]!
    expect(entryAfterEnRepublish.activePublications).toEqual([
      expect.objectContaining({ locale: 'de', revisionId: dePublish.versionId }),
      expect.objectContaining({ locale: 'en', revisionId: enRepublish.versionId }),
    ])
  })

  it('[LOC-05] publishes all ready locales through one revision and one atomic pointer update', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { de: { values: { title: 'Hallo Welt' } } } },
    })
    const result = await publishEntry(owner, entryId, ['en', 'de'])

    const entry = (await ctx.readAll('entries'))[0]!
    expect(entry.activePublications).toEqual([
      expect.objectContaining({ locale: 'de', revisionId: result.versionId }),
      expect.objectContaining({ locale: 'en', revisionId: result.versionId }),
    ])
    expect(await ctx.readAll('entryRevisions')).toEqual([
      expect.objectContaining({
        _id: result.versionId,
        kind: 'publish',
        affectedLocales: ['de', 'en'],
        snapshots: { de: expect.any(Object), en: expect.any(Object) },
      }),
    ])
    expect(await ctx.readAll('publicEntries')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId, locale: 'de', revisionId: result.versionId }),
        expect.objectContaining({ entryId, locale: 'en', revisionId: result.versionId }),
      ]),
    )
  })

  it('rejects execution when a confirmed publish preview becomes stale', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const args = { entryId, expectedVersion: 1, locales: ['en'] }
    const preview = await owner.mutation(api.entries.publish.previewPublishEntryOperation, args)
    expect(preview.allowed).toBe(true)
    expect(preview.confirmation?.token).toEqual(expect.any(String))

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Changed after preview' } } } },
    })
    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        ...args,
        _confirmationToken: preview.confirmation.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'ENTRY_CONCURRENT_EDIT' })
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('[EDT-05][PUB-01] returns canonical readiness blockers in preview and rechecks them during execution', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'authors',
      slug: 'missing-name',
      localized: {},
    })
    const expectedVersion = await currentDraftVersion(owner, entryId)
    const preview = await previewPublishEntryWithArgs(owner, {
      entryId,
      expectedVersion,
      locales: ['en'],
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Required field "name"') }),
      ]),
    )

    await expect(
      ctx.raw.run(async (inner) => {
        const expectedDraftHash = await computePublishDraftHash(inner, {
          entryId: entryId as never,
          locales: ['en'],
        })
        return await publishCurrentDraft(inner, {
          entryId: entryId as never,
          locales: ['en'],
          expectedDraftVersion: expectedVersion,
          expectedDraftHash,
          appIdentity: 'owner-1',
        })
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'VALIDATION_ERROR')
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('does not expose public-output mutations to MCP OAuth callers', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const now = Date.now()
    await ctx.seed('mcpOAuthDelegations', {
      oauthClientId: 'client-legacy-publish',
      ownerUserId: 'owner-1',
      label: 'legacy publish scope',
      scopes: [
        cmsPermissionKeys.read,
        cmsPermissionKeys.editEntries,
        cmsPermissionKeys.publishEntries,
      ],
      status: 'active',
      createdBy: 'owner-1',
      createdAt: now,
      updatedBy: 'owner-1',
      updatedAt: now,
      revokedAt: null,
    })
    const agent = ctx.asMcpOAuth('client-legacy-publish', 'owner-1')

    await expect(publishEntry(agent, entryId)).rejects.toThrow(/Publish entries/i)
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })
})
