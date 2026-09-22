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
  id: '2026-09-22-image-policy',

  async up(entry: TransitionInput): Promise<TransitionOutput> {
    // Install the reviewed Content image policy without rewriting authored MDC,
    // asset references, localized routes, or structured fields. The transition
    // validator checks the preserved bodies against the target policy.
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
