/// <reference types="vite/client" />

import type { createCtx } from '../../helpers'

export {
  archiveEntry,
  createCtx,
  currentDraftVersion,
  installTestContract,
  previewArchiveEntry,
  previewPermanentlyDeleteEntry,
  previewPublishEntryWithArgs,
  previewReorderEntry,
  previewReparentEntry,
  previewUnpublishEntry,
  publishEntry,
  permanentlyDeleteEntry,
  publishEntryWithArgs,
  readTestContractWriteToken,
  revertDraftToPublished,
  reorderEntry,
  reparentEntry,
  rollbackVersion,
  seedMember,
  seedMcpCredential,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
  unpublishEntry,
} from '../../helpers'

export async function seedStorageObject(
  ctx: ReturnType<typeof createCtx>,
  input: { bytes: string; type?: string },
) {
  return (await ctx.raw.run(
    async (innerCtx) => await innerCtx.storage.store(new Blob([input.bytes], { type: input.type })),
  )) as string
}

export async function seedEditorFixture(ctx: ReturnType<typeof createCtx>) {
  const entryId = await ctx.asCmsUser('owner-1').createEntry({
    collection: 'posts',
    slug: 'hello-world',
    localized: { title: 'Hello world', description: 'A canonical test entry.' },
  })
  return { collection: 'posts', entryId }
}

export async function seedTreeFixture(ctx: ReturnType<typeof createCtx>) {
  const owner = ctx.asCmsUser('owner-1')
  const rootAId = await owner.createEntry({
    collection: 'docs',
    slug: 'root-a',
    localized: { title: 'Root A' },
  })
  const rootBId = await owner.createEntry({
    collection: 'docs',
    slug: 'root-b',
    localized: { title: 'Root B' },
  })
  const childId = await owner.createEntry({
    collection: 'docs',
    slug: 'child',
    parentEntryId: rootAId,
    localized: { title: 'Child' },
  })
  const siblingId = await owner.createEntry({
    collection: 'docs',
    slug: 'sibling',
    parentEntryId: rootAId,
    localized: { title: 'Sibling' },
  })
  const grandchildId = await owner.createEntry({
    collection: 'docs',
    slug: 'grandchild',
    parentEntryId: childId,
    localized: { title: 'Grandchild' },
  })
  return {
    collection: 'docs',
    rootAId,
    rootBId,
    childId,
    siblingId,
    grandchildId,
  }
}
