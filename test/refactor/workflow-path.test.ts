/// <reference types="vite/client" />

import * as canonical from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import {
  entrySnapshotPath,
  localeSnapshotPathFromPublicPath,
  publicPathForLocaleSnapshot,
} from '../../packages/convex/src/entries/workflow/path.js'

type WorkflowCollection = Parameters<typeof publicPathForLocaleSnapshot>[0]

function collection(
  pathPrefix: string,
  overrides: {
    slugMode?: NonNullable<WorkflowCollection>['routing']['slugMode']
    rootSlug?: string | null
    singleton?: boolean
    settings?: Record<string, unknown>
  } = {},
): WorkflowCollection {
  return {
    routing: {
      mode: 'route',
      pathPrefix,
      slugMode: overrides.slugMode ?? 'shared',
      rootSlug: overrides.rootSlug ?? null,
      singleton: overrides.singleton ?? false,
    },
    settings: overrides.settings ?? {},
  }
}

function canonicalPublicPath(pathPrefix: string, slug: string): string {
  const leaf = canonical.generatePath(slug)
  const path = canonical.generateCanonicalKey(
    [pathPrefix, leaf].flatMap((part) => part.split('/').filter(Boolean)),
  )
  return path.startsWith('/') ? path : `/${path}`
}

describe('workflow path helpers', () => {
  it.each([
    ['/posts', 'Hello World'],
    ['/docs', '01.Getting Started'],
    ['/blog', 'Über uns & Preise'],
    ['', 'A/B Test + Email@Home'],
    ['/', 'guide/index'],
    ['/release-notes', '2026.05.notes'],
  ])('matches ginko-content shared-prefix semantics for %s + %s', (pathPrefix, slug) => {
    const localePath = canonical.generatePath(slug)

    expect(publicPathForLocaleSnapshot(collection(pathPrefix), localePath, 'en')).toBe(
      canonicalPublicPath(pathPrefix, slug),
    )
  })

  it('uses one helper shape for already-generated locale paths', () => {
    const localePath = canonical.generatePath('Nested/Release 2026.05')

    expect(publicPathForLocaleSnapshot(collection('/docs'), localePath, 'en')).toBe(
      canonicalPublicPath('/docs', 'Nested/Release 2026.05'),
    )
  })

  it('covers tree parent path semantics', () => {
    const docs = collection('/docs')
    const localePath = entrySnapshotPath(docs, {
      ancestorSlugs: ['Guides', '01.Getting Started'],
      slug: 'Install CMS',
    })

    expect(localePath).toBe('/guides/getting-started/install-cms')
    expect(publicPathForLocaleSnapshot(docs, localePath, 'en')).toBe(
      '/docs/guides/getting-started/install-cms',
    )
  })

  it('covers singleton path semantics', () => {
    const landing = collection('/pages', {
      singleton: true,
      rootSlug: 'home',
      settings: {
        singletonPath: '/',
        localizedSingletonPaths: {
          de: '/de/start',
        },
      },
    })

    expect(entrySnapshotPath(landing, { slug: 'Home' })).toBe('/home')
    expect(publicPathForLocaleSnapshot(landing, '/home', 'en')).toBe('/')
    expect(publicPathForLocaleSnapshot(landing, '/home', 'de')).toBe('/de/start')
  })

  it('covers rootSlug route lookup semantics', () => {
    const docs = collection('/docs', { rootSlug: 'workflows' })
    const rootPath = entrySnapshotPath(docs, { slug: 'workflows' })

    expect(rootPath).toBe('/workflows')
    expect(publicPathForLocaleSnapshot(docs, rootPath, 'en')).toBe('/docs')
    expect(localeSnapshotPathFromPublicPath(docs, '/docs', 'en')).toBe('/workflows')
  })

  it('covers localized rootSlug route lookup semantics', () => {
    const docs = collection('/docs', {
      rootSlug: 'workflows',
      settings: {
        localizedPathPrefixes: {
          de: '/dokumentation',
        },
        localizedRootSlugs: {
          de: 'arbeitsablaeufe',
        },
      },
    })
    const rootPath = entrySnapshotPath(docs, { slug: 'arbeitsablaeufe' })

    expect(rootPath).toBe('/arbeitsablaeufe')
    expect(publicPathForLocaleSnapshot(docs, rootPath, 'de')).toBe('/dokumentation')
    expect(localeSnapshotPathFromPublicPath(docs, '/dokumentation', 'de')).toBe('/arbeitsablaeufe')
  })

  it('covers localized and localizedStable slug modes', () => {
    const localized = collection('/blog', {
      slugMode: 'localized',
      settings: {
        localizedPathPrefixes: {
          de: '/de/blog',
        },
      },
    })
    const localizedStable = collection('/docs', { slugMode: 'localizedStable' })

    expect(
      publicPathForLocaleSnapshot(
        localized,
        entrySnapshotPath(localized, { slug: 'Über uns' }),
        'de',
      ),
    ).toBe('/de/blog/ueber-uns')
    expect(
      publicPathForLocaleSnapshot(
        localizedStable,
        entrySnapshotPath(localizedStable, { slug: 'Über uns', stableId: 'abc12' }),
        'en',
      ),
    ).toBe('/docs/ueber-uns-abc12')
  })

  it('can recover the locale snapshot path from a public path', () => {
    const docs = collection('/docs')
    const localized = collection('/blog', {
      settings: {
        localizedPathPrefixes: {
          de: '/de/blog',
        },
      },
    })

    expect(localeSnapshotPathFromPublicPath(docs, '/docs/root-a/child', 'en')).toBe('/root-a/child')
    expect(localeSnapshotPathFromPublicPath(localized, '/de/blog/ueber-uns', 'de')).toBe(
      '/ueber-uns',
    )
  })
})
