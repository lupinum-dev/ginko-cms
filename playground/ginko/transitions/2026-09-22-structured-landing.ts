type TransitionInput = {
  entryId: string
  collection: string
  stableId: string
  lifecycle: 'active' | 'archived'
  draftVersion: number
  sharedVersion: number
  slug: string
  parentEntryId: string | null
  orderRank: string
  nodeKind: 'page' | 'folder' | 'group' | 'section' | null
  shared: Record<string, unknown>
  locales: Record<
    string,
    {
      slug: string | null
      values: Record<string, unknown>
      bodyMdc: string
      version: number
    }
  >
}

type TransitionOutput = {
  slug: string
  parentEntryId: string | null
  orderRank: string
  nodeKind: 'page' | 'folder' | 'group' | 'section' | null
  shared: Record<string, unknown>
  locales: Record<
    string,
    {
      slug: string | null
      values: Record<string, unknown>
      bodyMdc: string
    }
  >
}

export default {
  id: '2026-09-22-structured-landing',

  async up(entry: TransitionInput): Promise<TransitionOutput> {
    // The pilot landing template never rendered an article body. Preserve every
    // field and refuse the cutover if a real body would become inaccessible.
    if (
      entry.collection === 'landing' &&
      Object.values(entry.locales).some((locale) => locale.bodyMdc.trim())
    ) {
      throw new Error(
        'Move the landing article body into a rendered field before enabling structured pages.',
      )
    }
    return {
      slug: entry.slug,
      parentEntryId: entry.parentEntryId,
      orderRank: entry.orderRank,
      nodeKind: entry.nodeKind,
      shared: entry.shared,
      locales: Object.fromEntries(
        Object.entries(entry.locales).map(([locale, value]) => [
          locale,
          {
            slug: value.slug,
            values: value.values,
            bodyMdc: value.bodyMdc,
          },
        ]),
      ),
    }
  },
}
