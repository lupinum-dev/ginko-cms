/// <reference types="vite/client" />

import type { PortableComponentPolicyV2 } from '@lupinum/ginko-content/cms-contract'
import type { CollaborationSnapshot } from '@lupinum/ginko-editor/runtime'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  installTestContract,
  seedOwner,
  seedMember,
  seedEditorFixture,
  publishEntry,
  revertDraftToPublished,
} from './helpers'

const api = anyApi
const insert = (text: string, at = 1) =>
  JSON.stringify({
    stepType: 'replace',
    from: at,
    to: at,
    slice: { content: [{ type: 'text', text }] },
  })
const property = (key: string, value: string) =>
  JSON.stringify({ stepType: 'ginkoSetNodePropertyV1', pos: 0, key, value })

async function fixture(source = 'Body.') {
  const ctx = createCtx()
  await seedOwner(ctx)
  const policy: PortableComponentPolicyV2 = {
    version: 2,
    components: {
      note: {
        kind: 'block',
        props: {
          title: { types: ['string'], required: true, allowedValues: null },
          tone: { types: ['string'], required: false, allowedValues: ['info', 'warning'] },
        },
        slots: ['default'],
        allowedParents: null,
        allowedChildren: null,
        media: null,
      },
    },
  }
  const { contract } = await installTestContract(ctx, ['en', 'de'], policy)
  const { entryId } = await seedEditorFixture(ctx)
  const owner = ctx.asCmsUser('owner-1')
  await owner.saveEntryDraft({
    entryId,
    expectedDraftVersion: 1,
    patch: { locales: { en: { bodyMdc: source } } },
  })
  const identity = { entryId, locale: 'en' }
  const opened = await owner.mutation(api.editor.openSharedBody, identity)
  const snapshot: CollaborationSnapshot = opened.snapshot
  const push = (steps: string[], base = snapshot, clientId = 'owner-1/session_a') =>
    owner.mutation(api.editor.pushSharedBody, {
      ...identity,
      epoch: base.epoch,
      schemaRevision: base.schemaRevision,
      policyRevision: base.policyRevision,
      version: base.version,
      clientId,
      steps,
    })
  return { ctx, owner, identity, snapshot, push, opened, contract }
}

describe('shared entry bodies', () => {
  it('checkpoints accepted text into the canonical draft without publishing or creating history', async () => {
    const { ctx, owner, identity, snapshot, push } = await fixture()
    await publishEntry(owner, identity.entryId)
    const publication = await ctx.readAll('publicEntries')
    const revisions = await ctx.readAll('entryRevisions')
    const before = (await ctx.readAll('entries'))[0]!
    const result = await push([insert('Shared ')])
    expect(result).toMatchObject({ status: 'ok', update: { fromVersion: 0, version: 1 } })
    expect(await ctx.readAll('entryLocaleDrafts')).toContainEqual(
      expect.objectContaining({ bodyMdc: 'Shared Body.\n' }),
    )
    expect((await ctx.readAll('entries'))[0]!.draftVersion).toBe(before.draftVersion + 1)
    expect(await ctx.readAll('publicEntries')).toEqual(publication)
    expect(await ctx.readAll('entryRevisions')).toEqual(revisions)
    const reopened = await owner.mutation(api.editor.openSharedBody, identity)
    expect(reopened.snapshot).toMatchObject({ epoch: snapshot.epoch, version: 1 })
    expect(reopened.snapshot.document).toContain('Shared Body.')
  })

  it('returns missed operations for retries instead of applying a duplicate insert', async () => {
    const { ctx, push } = await fixture()
    const first = await push([insert('Once ')])
    expect(await push([insert('Once ')])).toEqual(first)
    expect((await ctx.readAll('entryLocaleDrafts'))[0]!.bodyMdc).toBe('Once Body.\n')
    expect(await ctx.readAll('editorBodySteps')).toHaveLength(1)
  })

  it('preserves different component fields when a second writer retries at the accepted version', async () => {
    const { ctx, owner, identity, snapshot, push } = await fixture(
      '<note title="Original" tone="info">\nBody.\n</note>',
    )
    await push([property('title', 'Updated')])
    const missed = await push([property('tone', 'warning')], snapshot, 'owner-1/session_b')
    expect(missed.update.steps).toEqual([property('title', 'Updated')])
    await push([property('tone', 'warning')], { ...snapshot, version: 1 }, 'owner-1/session_b')
    const body = (await ctx.readAll('entryLocaleDrafts'))[0]!.bodyMdc
    expect(body).toContain('Updated')
    expect(body).toContain('warning')
    expect(await owner.query(api.editor.getSharedBodyHead, identity)).toMatchObject({ version: 2 })
  })

  it('authorizes every call and rejects writes immediately after membership revocation', async () => {
    const { ctx, identity, snapshot } = await fixture()
    await seedMember(ctx, { userId: 'editor-2', role: 'editor' })
    await seedMember(ctx, { userId: 'viewer-3', role: 'viewer' })
    const editor = ctx.asCmsUser('editor-2'),
      viewer = ctx.asCmsUser('viewer-3'),
      outsider = ctx.asCmsUser('outsider')
    await expect(viewer.query(api.editor.getSharedBodyHead, identity)).resolves.toMatchObject({
      version: 0,
    })
    await expect(viewer.mutation(api.editor.openSharedBody, identity)).rejects.toThrow()
    await expect(outsider.query(api.editor.getSharedBodyHead, identity)).rejects.toThrow()
    await expect(ctx.raw.query(api.editor.getSharedBodyHead, identity)).rejects.toThrow()
    const batch = {
      ...identity,
      epoch: snapshot.epoch,
      schemaRevision: snapshot.schemaRevision,
      policyRevision: snapshot.policyRevision,
      version: 0,
      clientId: 'editor-2/session_a',
      steps: [insert('Editor ')],
    }
    await expect(editor.mutation(api.editor.pushSharedBody, batch)).resolves.toMatchObject({
      status: 'ok',
    })
    await ctx.raw.run(async (inner) => {
      const member = await inner.db
        .query('members')
        .filter((q) => q.eq(q.field('userId'), 'editor-2'))
        .first()
      if (member) await inner.db.delete(member._id)
    })
    await expect(
      editor.mutation(api.editor.pushSharedBody, { ...batch, version: 1 }),
    ).rejects.toThrow()
    await expect(
      editor.query(api.editor.pullSharedBody, {
        ...identity,
        epoch: snapshot.epoch,
        schemaRevision: snapshot.schemaRevision,
        policyRevision: snapshot.policyRevision,
        version: 0,
      }),
    ).rejects.toThrow()
  })

  it('fences external source replacement and opens a new generation without applying stale edits', async () => {
    const { ctx, owner, identity, snapshot, push } = await fixture()
    const entry = (await ctx.readAll('entries'))[0]!
    await owner.saveEntryDraft({
      entryId: identity.entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: { locales: { en: { bodyMdc: 'Replacement.' } } },
    })
    expect(await push([insert('Old ')])).toMatchObject({ status: 'stale', reason: 'epoch' })
    const reopened = await owner.mutation(api.editor.openSharedBody, identity)
    expect(reopened.snapshot.epoch).not.toBe(snapshot.epoch)
    expect(reopened.snapshot.document).toContain('Replacement.')
    expect(reopened.snapshot.version).toBe(0)
    expect(await push([insert('Still old ')])).toMatchObject({ status: 'stale', reason: 'epoch' })
  })

  it('fences a deleted and recreated translation even when its source text is identical', async () => {
    const { ctx, owner, identity } = await fixture()
    await publishEntry(owner, identity.entryId)
    const german = { ...identity, locale: 'de' }
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      ...german,
      source: { kind: 'blank' },
    })
    const opened = await owner.mutation(api.editor.openSharedBody, german)
    await revertDraftToPublished(owner, identity.entryId)
    expect((await ctx.readAll('entryLocaleDrafts')).some((row) => row.locale === 'de')).toBe(false)
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      ...german,
      source: { kind: 'blank' },
    })
    const { document: _document, ...head } = opened.snapshot
    const stale = await owner.mutation(api.editor.pushSharedBody, {
      ...german,
      ...head,
      clientId: 'owner-1/session_old',
      steps: [insert('Old translation')],
    })
    expect(stale).toMatchObject({ status: 'stale', reason: 'epoch' })
    const reopened = await owner.mutation(api.editor.openSharedBody, german)
    expect(reopened.snapshot.epoch).not.toBe(opened.snapshot.epoch)
  })

  it('allows metadata saves without resetting the body session and rejects stale scalar drafts', async () => {
    const { ctx, owner, identity, snapshot, push } = await fixture()
    const version = (await ctx.readAll('entries'))[0]!.draftVersion
    await owner.saveEntryDraft({
      entryId: identity.entryId,
      expectedDraftVersion: version,
      patch: { locales: { en: { values: { title: 'New title' } } } },
    })
    await push([insert('Shared ')])
    expect(await owner.query(api.editor.getSharedBodyHead, identity)).toMatchObject({
      epoch: snapshot.epoch,
      version: 1,
    })
    await expect(
      owner.saveEntryDraft({
        entryId: identity.entryId,
        expectedDraftVersion: version,
        patch: { locales: { en: { values: { title: 'Stale title' } } } },
      }),
    ).rejects.toThrow()
    expect((await ctx.readAll('entryLocaleDrafts'))[0]!.values.title).toBe('New title')
  })

  it('rejects invalid, oversized, and forged operations atomically', async () => {
    const { ctx, snapshot, push } = await fixture()
    const before = await ctx.readAll('entryLocaleDrafts')
    for (const steps of [
      [],
      ['{}'],
      [insert('x'.repeat(66000))],
      [insert('Valid '), property('unknown', 'invalid')],
    ]) {
      await expect(push(steps)).rejects.toThrow()
    }
    await expect(push([insert('Forged ')], snapshot, 'other/session_a')).rejects.toThrow()
    await expect(push([insert('Future ')], { ...snapshot, version: 100 })).rejects.toThrow()
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(before)
    expect(await ctx.readAll('editorBodySteps')).toEqual([])
  })

  it('bounds operation history and asks older clients to recover from a fresh snapshot', async () => {
    const { ctx, owner, identity, snapshot, push } = await fixture()
    const steps = Array.from({ length: 64 }, () => [
      insert('X'),
      JSON.stringify({ stepType: 'replace', from: 1, to: 2 }),
    ]).flat()
    for (let batch = 0; batch < 9; batch++) await push(steps, { ...snapshot, version: batch * 128 })
    const room = (await ctx.readAll('editorBodyRooms'))[0]!
    expect(room.version).toBe(1152)
    expect(room.minimumVersion).toBe(128)
    expect(await ctx.readAll('editorBodySteps')).toHaveLength(8)
    const { document: _document, ...head } = snapshot
    expect(await owner.query(api.editor.pullSharedBody, { ...identity, ...head })).toMatchObject({
      status: 'stale',
      reason: 'history',
    })
    expect(await owner.mutation(api.editor.openSharedBody, identity)).toMatchObject({
      snapshot: { version: 1152 },
    })
  })

  it('updates canonical asset references in the same accepted body transaction', async () => {
    const { ctx, push } = await fixture('![Description](aaaaaaaaaaaaaaaaaaaaaaaa)')
    await push([property('src', 'bbbbbbbbbbbbbbbbbbbbbbbb')])
    const refs = await ctx.readAll('contentAssetRefs')
    expect(refs).toContainEqual(
      expect.objectContaining({
        sourceKind: 'draft',
        assetId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        fieldPath: 'bodyMdc',
      }),
    )
    expect(refs).not.toContainEqual(
      expect.objectContaining({ sourceKind: 'draft', assetId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
    )
  })

  it('keeps source-only bodies and legacy policies in the existing local editor', async () => {
    const sourceOnly = await fixture('<!-- Keep this comment -->\n\nBody.')
    expect(sourceOnly.opened).toEqual({ available: false, reason: 'source' })
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const { entryId } = await seedEditorFixture(ctx)
    expect(
      await ctx.asCmsUser('owner-1').mutation(api.editor.openSharedBody, { entryId, locale: 'en' }),
    ).toEqual({ available: false, reason: 'policy' })
    expect(await ctx.readAll('editorBodyRooms')).toEqual([])
  })
})
