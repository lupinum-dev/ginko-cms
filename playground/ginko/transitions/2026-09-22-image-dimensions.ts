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
  id: '2026-09-22-image-dimensions',

  async up(entry: TransitionInput): Promise<TransitionOutput> {
    // MDC exposes image dimensions as numeric attribute strings. Permit that
    // representation in the installed policy while preserving authored content.
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
