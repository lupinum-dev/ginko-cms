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
  createCtx,
  currentDraftVersion,
  previewPublishEntryWithArgs,
  publishEntry,
  seedEditorFixture,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
} from './helpers'

const api = anyApi

function publicRowFor(rows: Array<Record<string, unknown>>, entryId: string, locale: string) {
  return rows.find((row) => row.entryId === entryId && row.locale === locale)
}

describe('canonical publication lifecycle', () => {
  it('publishes EN and DE independently and retains each locale active revision', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.entries.draft.createLocaleVariant, { entryId, locale: 'de' })
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

  it('publishes all ready locales through one revision and one atomic pointer update', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.entries.draft.createLocaleVariant, { entryId, locale: 'de' })
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
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_CONCURRENT_EDIT',
    )
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('returns readiness blockers in preview and rechecks them during execution', async () => {
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
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_PUBLISH_NOT_READY',
    )
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('does not expose public-output mutations to MCP credentials', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const now = Date.now()
    await ctx.seed('mcpCredentialSettings', {
      apiKeyId: 'ba_key_legacy_publish',
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
    const agent = ctx.asMcpApiKey('ba_key_legacy_publish', 'owner-1')

    await expect(publishEntry(agent, entryId)).rejects.toThrow(/Publish entries/i)
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })
})
