import { describe, expect, it } from 'vitest'

import {
  contentTags,
  normalizeContentPath,
  uniqueContentTags,
} from '../../packages/contract/src/contentTags'

describe('canonical content cache tags', () => {
  it('builds the public CMS dependency tag vocabulary', () => {
    expect(contentTags.entry('blog', 'post-1')).toBe('entry:blog:post-1')
    expect(contentTags.entry('blog', 'post-1', 'en')).toBe('entry:blog:post-1:en')
    expect(contentTags.collection('blog')).toBe('collection:blog')
    expect(contentTags.route('blog/post-1/')).toBe('route:/blog/post-1/')
    expect(contentTags.nav('docs', 'de')).toBe('nav:docs:de')
    expect(contentTags.search('en')).toBe('search:en')
    expect(contentTags.sitemap()).toBe('sitemap')
    expect(contentTags.siteData('announcement', 'en')).toBe('site-data:announcement:en')
    expect(contentTags.asset('hero image')).toBe('asset:hero-image')
  })

  it('normalizes paths and dedupes accumulated tags', () => {
    expect(normalizeContentPath('')).toBe('/')
    expect(normalizeContentPath('/docs/intro/')).toBe('/docs/intro/')
    expect(uniqueContentTags(['collection:docs', null, 'collection:docs', undefined])).toEqual([
      'collection:docs',
    ])
  })
})
