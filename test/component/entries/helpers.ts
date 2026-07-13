/// <reference types="vite/client" />

export {
  archiveEntry,
  createCtx,
  currentDraftVersion,
  previewArchiveEntry,
  previewPublishEntryWithArgs,
  previewUnpublishEntry,
  publishEntry,
  publishEntryWithArgs,
  revertDraftToPublished,
  seedMember,
  rollbackVersion,
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

export async function seedOwner(ctx: ReturnType<typeof createCtx>, userId = 'owner-1') {
  const now = Date.now()
  await ctx.seed(
    'members' as never,
    {
      userId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    } as never,
  )
}

export async function seedSettings(ctx: ReturnType<typeof createCtx>) {
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
}

export async function seedMultiLocaleSettings(ctx: ReturnType<typeof createCtx>) {
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
}

export async function seedEditorFixture(ctx: ReturnType<typeof createCtx>) {
  const now = Date.now()
  const collectionId = await ctx.seed(
    'collections' as never,
    {
      slug: 'posts',
      label: { en: 'Posts' },
      icon: null,
      type: 'flat',
      routing: {
        pathPrefix: '/posts',
        slugMode: 'shared',
        rootSlug: null,
        singleton: false,
      },
      locales: ['en'],
      fields: [
        { key: 'title', type: 'text', localized: true, searchable: true },
        { key: 'hero', type: 'image', localized: false },
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

  const entryId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'hello-world',
      stableId: 'hello-world',
      status: 'draft',
      dirtyLocales: ['en'],
      parentEntryId: null,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    } as never,
  )

  await ctx.seed(
    'entryDrafts' as never,
    {
      entryId,
      locale: null,
      baseRevisionId: null,
      parentEntryId: null,
      orderRank: 'a0',
      slug: 'hello-world',
      shared: {},
      updatedBy: 'owner-1',
      updatedAt: now,
    } as never,
  )

  await ctx.seed(
    'entryDrafts' as never,
    {
      entryId,
      locale: 'en',
      baseRevisionId: null,
      values: {
        title: 'Hello world',
      },
      bodyMdc: '',
      updatedBy: 'owner-1',
      updatedAt: now,
    } as never,
  )

  return {
    collectionId: collectionId as string,
    entryId: entryId as string,
  }
}

export async function seedTreeFixture(ctx: ReturnType<typeof createCtx>) {
  const now = Date.now()
  const collectionId = await ctx.seed(
    'collections' as never,
    {
      slug: 'docs',
      label: { en: 'Docs' },
      icon: null,
      type: 'tree',
      routing: {
        pathPrefix: '/docs',
        slugMode: 'shared',
        rootSlug: null,
        singleton: false,
      },
      locales: ['en'],
      fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
      settings: { maxDepth: 4 },
      createdAt: now,
      updatedAt: now,
      updatedBy: 'owner-1',
    } as never,
  )

  const rootAId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'root-a',
      stableId: 'docs-root-a',
      status: 'draft',
      dirtyLocales: ['en'],
      parentEntryId: null,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    } as never,
  )

  const rootBId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'root-b',
      stableId: 'docs-root-b',
      status: 'draft',
      dirtyLocales: ['en'],
      parentEntryId: null,
      orderRank: 'b0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    } as never,
  )

  const childId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'child',
      stableId: 'docs-child',
      status: 'draft',
      dirtyLocales: ['en'],
      parentEntryId: rootAId,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    } as never,
  )

  const siblingId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'sibling',
      stableId: 'docs-sibling',
      status: 'draft',
      dirtyLocales: ['en'],
      parentEntryId: rootAId,
      orderRank: 'b0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    } as never,
  )

  const grandchildId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'grandchild',
      stableId: 'docs-grandchild',
      status: 'draft',
      dirtyLocales: ['en'],
      parentEntryId: childId,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    } as never,
  )

  const localeRows = [
    {
      entryId: rootAId,
      parentEntryId: null,
      orderRank: 'a0',
      slug: 'root-a',
      path: '/docs/root-a',
      title: 'Root A',
    },
    {
      entryId: rootBId,
      parentEntryId: null,
      orderRank: 'b0',
      slug: 'root-b',
      path: '/docs/root-b',
      title: 'Root B',
    },
    {
      entryId: childId,
      parentEntryId: rootAId,
      orderRank: 'a0',
      slug: 'child',
      path: '/docs/root-a/child',
      title: 'Child',
    },
    {
      entryId: siblingId,
      parentEntryId: rootAId,
      orderRank: 'b0',
      slug: 'sibling',
      path: '/docs/root-a/sibling',
      title: 'Sibling',
    },
    {
      entryId: grandchildId,
      parentEntryId: childId,
      orderRank: 'a0',
      slug: 'grandchild',
      path: '/docs/root-a/child/grandchild',
      title: 'Grandchild',
    },
  ]

  for (const row of localeRows) {
    await ctx.seed(
      'entryDrafts' as never,
      {
        entryId: row.entryId,
        locale: null,
        baseRevisionId: null,
        parentEntryId: row.parentEntryId,
        orderRank: row.orderRank,
        slug: row.slug,
        shared: {},
        updatedBy: 'owner-1',
        updatedAt: now,
      } as never,
    )
    await ctx.seed(
      'entryDrafts' as never,
      {
        entryId: row.entryId,
        locale: 'en',
        baseRevisionId: null,
        values: {
          title: row.title,
        },
        bodyMdc: '',
        updatedBy: 'owner-1',
        updatedAt: now,
      } as never,
    )
  }

  return {
    collectionId: collectionId as string,
    rootAId: rootAId as string,
    rootBId: rootBId as string,
    childId: childId as string,
    siblingId: siblingId as string,
    grandchildId: grandchildId as string,
  }
}
