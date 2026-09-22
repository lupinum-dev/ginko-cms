import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  publishEntry,
  revertDraftToPublished,
  seedMember,
  seedMultiLocaleSettings,
  seedOwner,
} from './helpers'

const api = anyApi

async function fixture() {
  const ctx = createCtx()
  await seedOwner(ctx)
  await seedMember(ctx, { userId: 'editor-2', role: 'editor' })
  await seedMultiLocaleSettings(ctx)
  const owner = ctx.asCmsUser('owner-1')
  const editor = ctx.asCmsUser('editor-2')
  const entryId = await owner.createEntry({
    collection: 'posts',
    slug: 'working-together',
    localized: { title: 'Original', description: 'Introduction' },
  })
  const entry = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
  const baseValues: JsonMap = entry.locales.find((item: { locale: string }) => item.locale === 'en')
    .draft.values
  const localeDraftIds: Record<string, string> = { en: entry.localeData.draftId }
  const save = (requestId: string, values: JsonMap, locale = 'en', original = baseValues) => ({
    entryId,
    expectedDraftVersion: entry.draftVersion,
    concurrency: {
      requestId,
      localeDraftIds: { [locale]: localeDraftIds[locale] ?? 'missing' },
      base: { locales: { [locale]: { values: original } } },
    },
    patch: { locales: { [locale]: { values } } },
  })
  const read = () => owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
  return { ctx, owner, editor, entryId, entry, baseValues, save, read, localeDraftIds }
}

describe('collaborative draft saves', () => {
  it('merges different fields from two authorized users with the same aggregate baseline', async () => {
    const { owner, editor, baseValues, save, read } = await fixture()
    await owner.saveEntryDraft(save('title-1', { ...baseValues, title: 'New title' }))
    await editor.saveEntryDraft(
      save('description-1', { ...baseValues, description: 'New introduction' }),
    )
    expect((await read()).data).toMatchObject({
      title: 'New title',
      description: 'New introduction',
    })
  })

  it('preserves remote and local work when the same field overlaps; writes none of the conflicting batch', async () => {
    const { owner, editor, baseValues, save, read } = await fixture()
    await owner.saveEntryDraft(save('title-1', { ...baseValues, title: 'Agency title' }))
    await expect(
      editor.saveEntryDraft(
        save('title-2', {
          ...baseValues,
          title: 'Client title',
          description: 'Unrelated change in same batch',
        }),
      ),
    ).rejects.toThrow(/ENTRY_DRAFT_FIELD_CONFLICT/)
    expect((await read()).data).toMatchObject({
      title: 'Agency title',
      description: 'Introduction',
    })
  })

  it('treats missing and null as different values and deletes only the intended field', async () => {
    const { owner, editor, baseValues, save, read } = await fixture()
    await owner.saveEntryDraft(save('null-1', { ...baseValues, description: null }))
    await expect(
      editor.saveEntryDraft(save('delete-stale', { title: 'Original' })),
    ).rejects.toThrow(/ENTRY_DRAFT_FIELD_CONFLICT/)
    await editor.saveEntryDraft(
      save('delete-reviewed', { title: 'Original' }, 'en', { ...baseValues, description: null }),
    )
    expect((await read()).locales[0].draft.values).toEqual({ title: 'Original' })
  })

  it('lets independent language edits coexist without changing the other language', async () => {
    const { owner, editor, entryId, baseValues, save, read, localeDraftIds } = await fixture()
    localeDraftIds.de = await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft(save('english', { ...baseValues, title: 'English title' }))
    await editor.saveEntryDraft(save('german', { title: 'Deutscher Titel' }, 'de', {}))
    const result = await read()
    expect(
      result.locales.find((item: { locale: string }) => item.locale === 'en').draft.values.title,
    ).toBe('English title')
    expect(
      result.locales.find((item: { locale: string }) => item.locale === 'de').draft.values.title,
    ).toBe('Deutscher Titel')
  })

  it('does not silently create or edit a missing or unsupported language', async () => {
    const { owner, save } = await fixture()
    await expect(
      owner.saveEntryDraft(save('missing', { title: 'Hallo' }, 'de', {})),
    ).rejects.toThrow(/ENTRY_LOCALE_DRAFT_MISSING/)
    await expect(
      owner.saveEntryDraft(save('unsupported', { title: 'Bonjour' }, 'fr', {})),
    ).rejects.toThrow()
  })

  it('replays only the acknowledgment after an ambiguous response, even after a later edit', async () => {
    const { ctx, owner, editor, baseValues, save, read } = await fixture()
    const first = save('response-lost', { ...baseValues, title: 'First change' })
    const receipt = await owner.saveEntryDraft(first)
    await editor.saveEntryDraft(
      save('later-edit', { ...baseValues, title: 'Later change' }, 'en', {
        ...baseValues,
        title: 'First change',
      }),
    )
    expect(await owner.saveEntryDraft(first)).toEqual(receipt)
    expect((await read()).data.title).toBe('Later change')
    expect(await ctx.readAll('draftSaveReceipts')).toHaveLength(2)
    await expect(
      owner.saveEntryDraft({
        ...first,
        patch: { locales: { en: { values: { ...baseValues, title: 'Reused identifier' } } } },
      }),
    ).rejects.toThrow(/ENTRY_DRAFT_REQUEST_REUSED/)
  })

  it('keeps receipts scoped to the authenticated member and denies revoked and nonmember retries', async () => {
    const { ctx, owner, editor, baseValues, save } = await fixture()
    const request = save('same-request-id', { ...baseValues, title: 'First' })
    await owner.saveEntryDraft(request)
    await expect(editor.saveEntryDraft(request)).rejects.toThrow(/ENTRY_DRAFT_FIELD_CONFLICT/)
    await expect(ctx.asCmsUser('nonmember').saveEntryDraft(request)).rejects.toThrow()
    await expect(ctx.raw.mutation(api.entries.draft.saveEntryDraft, request)).rejects.toThrow()
    await ctx.raw.run(async (inner) => {
      const member = await inner.db
        .query('members')
        .filter((q) => q.eq(q.field('userId'), 'owner-1'))
        .first()
      if (member) await inner.db.delete(member._id)
    })
    await expect(owner.saveEntryDraft(request)).rejects.toThrow()
  })

  it('checks the current contract write gate before acknowledging a retry', async () => {
    const { ctx, owner, baseValues, save } = await fixture()
    const request = save('before-contract-lock', { ...baseValues, title: 'Saved' })
    await owner.saveEntryDraft(request)
    await ctx.raw.run(async (inner) => {
      const installed = await inner.db.query('cmsContract').first()
      if (installed) await inner.db.patch(installed._id, { transitionState: 'locked' })
    })
    await expect(owner.saveEntryDraft(request)).rejects.toThrow()
    expect(await ctx.readAll('draftSaveReceipts')).toHaveLength(1)
  })

  it('acknowledges simultaneous duplicate delivery with one saved version and one receipt', async () => {
    const { ctx, owner, baseValues, save } = await fixture()
    const request = save('duplicated-delivery', { ...baseValues, title: 'Saved once' })
    const responses = await Promise.all([
      owner.saveEntryDraft(request),
      owner.saveEntryDraft(request),
    ])
    expect(responses[0]).toEqual(responses[1])
    expect(await ctx.readAll('draftSaveReceipts')).toHaveLength(1)
  })

  it('rejects a queued edit when its locale was deleted and recreated with the same values', async () => {
    const { owner, editor, entryId, save, localeDraftIds } = await fixture()
    await publishEntry(owner, entryId)
    localeDraftIds.de = await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    const queued = save('old-german-session', { title: 'An old pending edit' }, 'de', {})
    await revertDraftToPublished(owner, entryId)
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await expect(editor.saveEntryDraft(queued)).rejects.toThrow(/ENTRY_DRAFT_LOCALE_REPLACED/)
  })

  it('rejects an unsupported requested locale and preserves the identity of a supported missing locale', async () => {
    const { owner, entryId } = await fixture()
    await expect(owner.query(api.editor.getEntry, { id: entryId, locale: 'fr' })).rejects.toThrow(
      /UNSUPPORTED_LOCALE/,
    )
    const missing = await owner.query(api.editor.getEntry, { id: entryId, locale: 'de' })
    expect(missing.locale).toBe('de')
    expect(missing.localeData.draftId).toBeNull()
    expect(missing.localeData.draft.values).toEqual({})
    expect(
      missing.locales.find((item: { locale: string }) => item.locale === 'de').draftExists,
    ).toBe(false)
    expect((await owner.query(api.editor.getEntry, { id: entryId })).locale).toBe('en')
  })

  it('requires a locale identity for every edited locale and rejects identities for unrelated locales', async () => {
    const { owner, baseValues, save } = await fixture()
    const request = save('missing-identity', { ...baseValues, title: 'Changed' })
    await expect(
      owner.saveEntryDraft({
        ...request,
        concurrency: { ...request.concurrency, localeDraftIds: {} },
      }),
    ).rejects.toThrow(/ENTRY_DRAFT_BASE_INVALID/)
    await expect(
      owner.saveEntryDraft({
        ...request,
        concurrency: {
          ...request.concurrency,
          localeDraftIds: { ...request.concurrency.localeDraftIds, de: 'unrelated' },
        },
      }),
    ).rejects.toThrow(/ENTRY_DRAFT_BASE_INVALID/)
  })

  it('rejects partial baselines and keeps legacy whole-draft conflict behavior', async () => {
    const { owner, entryId, entry, baseValues, save } = await fixture()
    await expect(
      owner.saveEntryDraft({
        ...save('invalid-base', baseValues),
        concurrency: { requestId: 'invalid-base', base: {}, localeDraftIds: {} },
      }),
    ).rejects.toThrow(/ENTRY_DRAFT_BASE_INVALID/)
    await owner.saveEntryDraft(save('first', { ...baseValues, title: 'First' }))
    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: entry.draftVersion,
        patch: { locales: { en: { values: baseValues } } },
      }),
    ).rejects.toThrow(/ENTRY_CONCURRENT_EDIT/)
  })

  it('keeps a rich-text body atomic while allowing an independent field update', async () => {
    const { owner, editor, entryId, entry, baseValues, save, read } = await fixture()
    const bodyRequest = {
      entryId,
      expectedDraftVersion: entry.draftVersion,
      concurrency: {
        requestId: 'body-1',
        localeDraftIds: { en: entry.localeData.draftId },
        base: { locales: { en: { bodyMdc: '' } } },
      },
      patch: { locales: { en: { bodyMdc: 'Agency paragraph.' } } },
    }
    await owner.saveEntryDraft(bodyRequest)
    await editor.saveEntryDraft(
      save('title-alongside-body', { ...baseValues, title: 'Client title' }),
    )
    await expect(
      editor.saveEntryDraft({
        ...bodyRequest,
        concurrency: { ...bodyRequest.concurrency, requestId: 'body-2' },
        patch: { locales: { en: { bodyMdc: 'Client paragraph.' } } },
      }),
    ).rejects.toThrow(/ENTRY_DRAFT_FIELD_CONFLICT/)
    expect((await read()).locales[0].draft.bodyMdc).toBe('Agency paragraph.')
  })

  it('merges shared fields and placement independently, while conflicting on the same placement', async () => {
    const { owner, editor, entryId, entry } = await fixture()
    const currentShared = entry.draft
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      concurrency: {
        requestId: 'shared-field',
        localeDraftIds: {},
        base: { shared: { shared: currentShared } },
      },
      patch: { shared: { shared: { ...currentShared, featured: true } } },
    })
    const routeRequest = {
      entryId,
      expectedDraftVersion: entry.draftVersion,
      concurrency: {
        requestId: 'route',
        localeDraftIds: {},
        base: { shared: { slug: entry.baseSlug } },
      },
      patch: { shared: { slug: 'new-address' } },
    }
    await editor.saveEntryDraft(routeRequest)
    const saved = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    expect(saved.draft.featured).toBe(true)
    expect(saved.baseSlug).toBe('new-address')
    await expect(
      owner.saveEntryDraft({
        ...routeRequest,
        concurrency: { ...routeRequest.concurrency, requestId: 'other-route' },
        patch: { shared: { slug: 'competing-address' } },
      }),
    ).rejects.toThrow(/ENTRY_DRAFT_FIELD_CONFLICT/)
  })

  it('rolls back a conflicting route and its receipt together', async () => {
    const { ctx, owner, entryId, entry } = await fixture()
    await owner.createEntry({
      collection: 'posts',
      slug: 'already-taken',
      localized: { title: 'Other page' },
    })
    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: entry.draftVersion,
        concurrency: {
          requestId: 'route-collision',
          localeDraftIds: {},
          base: { shared: { slug: entry.baseSlug } },
        },
        patch: { shared: { slug: 'already-taken' } },
      }),
    ).rejects.toThrow()
    const saved = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    expect(saved.baseSlug).toBe(entry.baseSlug)
    expect(saved.draftVersion).toBe(entry.draftVersion)
    expect(await ctx.readAll('draftSaveReceipts')).toEqual([])
  })

  it('acknowledges an unchanged save without invalidating a publication review', async () => {
    const { owner, entry, baseValues, save } = await fixture()
    const result = await owner.saveEntryDraft(save('unchanged', baseValues))
    expect(result.draftVersion).toBe(entry.draftVersion)
  })

  it('preserves aggregate publication review fences and keeps later drafts private', async () => {
    const { owner, entryId, entry, baseValues, save, ctx } = await fixture()
    const preview = await owner.mutation(api.entries.publish.previewPublishEntryOperation, {
      entryId,
      expectedVersion: entry.draftVersion,
      locales: ['en'],
    })
    await owner.saveEntryDraft(
      save('after-review', { ...baseValues, title: 'Changed after review' }),
    )
    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        entryId,
        expectedVersion: entry.draftVersion,
        locales: ['en'],
        _confirmationToken: preview.confirmation?.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'ENTRY_CONCURRENT_EDIT' })
    await publishEntry(owner, entryId)
    const published = await ctx.readAll('publicEntries')
    await owner.saveEntryDraft(
      save('private-next', { ...baseValues, title: 'Private work' }, 'en', {
        ...baseValues,
        title: 'Changed after review',
      }),
    )
    expect(await ctx.readAll('publicEntries')).toEqual(published)
  })
})
