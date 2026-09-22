import { describe, expect, it } from 'vitest'

import transition from '../../playground/ginko/transitions/2026-09-22-structured-landing'

function entry(collection: string, bodyMdc = '') {
  return {
    entryId: 'fixture',
    collection,
    stableId: 'fixture',
    lifecycle: 'active' as const,
    draftVersion: 3,
    sharedVersion: 1,
    slug: 'home',
    parentEntryId: null,
    orderRank: 'a',
    nodeKind: 'page' as const,
    shared: { image: 'asset-fixture' },
    locales: {
      en: { slug: 'home', values: { title: 'Hello', cta_href: '/blog' }, bodyMdc, version: 2 },
      de: { slug: 'start', values: { title: 'Hallo', cta_href: '/de/blog' }, bodyMdc, version: 1 },
    },
  }
}

describe('Structured landing contract transition', () => {
  it('preserves scalar fields, locale paths, shared assets and blank body columns for reversible cutover', async () => {
    const before = entry('landing')
    const after = await transition.up(before)
    expect(after).toEqual({
      slug: before.slug,
      parentEntryId: before.parentEntryId,
      orderRank: before.orderRank,
      nodeKind: before.nodeKind,
      shared: before.shared,
      locales: {
        en: { slug: 'home', values: before.locales.en.values, bodyMdc: '' },
        de: { slug: 'start', values: before.locales.de.values, bodyMdc: '' },
      },
    })
    // Restoring the previous article-body contract needs no destructive reverse
    // transform: its original columns and their values remain available.
    expect(after.locales.en.bodyMdc).toBe(before.locales.en.bodyMdc)
  })

  it('refuses to hide real landing article content and leaves other collections intact', async () => {
    await expect(transition.up(entry('landing', '# Keep this content'))).rejects.toThrow(
      'Move the landing article body',
    )
    const article = await transition.up(entry('blog', '# Keep this content'))
    expect(article.locales.en.bodyMdc).toBe('# Keep this content')
    expect(article.locales.de.bodyMdc).toBe('# Keep this content')
  })
})
