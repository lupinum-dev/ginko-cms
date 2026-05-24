import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  applyFilesystemMigration,
  createFilesystemImportPayload,
  createFilesystemMigrationPlan,
  previewFilesystemMigration,
  rewriteFilesystemMigrationAssetReferences,
  uploadFilesystemMigrationAssets,
} from '../../packages/cms/src/migration/index.js'

describe('filesystem migration planning', () => {
  it('parses structured frontmatter and returns an auditable apply result', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-migration-'))
    mkdirSync(join(rootDir, 'collections'), { recursive: true })
    mkdirSync(join(rootDir, 'assets'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'docs', 'guide'), { recursive: true })
    writeFileSync(join(rootDir, 'assets', 'guide.png'), 'fake-png')
    writeFileSync(
      join(rootDir, 'collections', 'docs.json'),
      JSON.stringify({
        slug: 'docs',
        label: { en: 'Docs' },
        type: 'tree',
        routing: { mode: 'route', pathPrefix: '/docs' },
        locales: ['en'],
        fields: [],
      }),
    )
    writeFileSync(
      join(rootDir, 'content', 'docs', 'guide', 'index.md'),
      [
        '---',
        'title: Guide',
        'description: "Structured import"',
        'tags:',
        '  - tutorial',
        '  - launch',
        'seo:',
        '  noindex: false',
        'actions:',
        '  - label: Start',
        '    to: /docs/guide',
        'hero: { badge: Docs, featured: true, image: /assets/guide.png }',
        '---',
        '# Guide',
        '![Guide](/assets/guide.png)',
      ].join('\n'),
    )

    const plan = await createFilesystemMigrationPlan({ rootDir })

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0]).toMatchObject({
      collection: 'docs',
      routePath: '/docs/guide',
      slug: 'guide',
      localized: {
        title: 'Guide',
        description: 'Structured import',
        body: '# Guide\n![Guide](/assets/guide.png)',
      },
      shared: {
        tags: ['tutorial', 'launch'],
        actions: [{ label: 'Start', to: '/docs/guide' }],
        hero: { badge: 'Docs', featured: true, image: '/assets/guide.png' },
      },
      seo: { noindex: false },
    })

    const payload = createFilesystemImportPayload(plan)
    expect(payload).toMatchObject({
      collections: [expect.objectContaining({ slug: 'docs' })],
      entries: [expect.objectContaining({ stableId: 'docs:guide:index' })],
      assets: [
        {
          sourcePath: '/assets/guide.png',
          referencedBy: [expect.stringContaining('guide/index.md')],
        },
      ],
    })

    const target = {
      previewImport: vi.fn(async () => ({ ok: true })),
      applyImport: vi.fn(async () => ({
        status: 'applied',
        entries: {
          created: ['docs:guide:index:en'],
          updated: [],
          published: ['docs:guide:index:en'],
          skipped: [],
        },
        noops: [],
        blockedChanges: [],
      })),
    }
    await expect(previewFilesystemMigration(plan, target)).resolves.toEqual({ ok: true })
    const result = await applyFilesystemMigration(plan, target)

    expect(target.previewImport).toHaveBeenCalledWith(payload)
    expect(target.applyImport).toHaveBeenCalledWith(payload)
    expect(result).toEqual({
      status: 'applied',
      entries: {
        created: ['docs:guide:index:en'],
        updated: [],
        published: ['docs:guide:index:en'],
        skipped: [],
      },
      noops: [],
      blockedChanges: [],
    })

    const rewritten = rewriteFilesystemMigrationAssetReferences(plan, [
      {
        sourcePath: '/assets/guide.png',
        replacement: 'https://assets.example/guide.png',
      },
    ])
    expect(rewritten.entries[0]?.shared).toMatchObject({
      hero: { image: 'https://assets.example/guide.png' },
    })
    expect(rewritten.entries[0]?.localized.body).toBe(
      '# Guide\n![Guide](https://assets.example/guide.png)',
    )
    expect(rewritten.entries[0]?.bodyMdc).toBe(
      '# Guide\n![Guide](https://assets.example/guide.png)',
    )
    expect(rewritten.assets).toEqual([])

    const uploaded = await uploadFilesystemMigrationAssets(plan, async (asset) => {
      expect(asset.sourcePath).toBe('/assets/guide.png')
      return 'https://assets.example/uploaded-guide.png'
    })
    expect(uploaded).toMatchObject({
      uploaded: 1,
      skipped: 0,
      replacements: [
        {
          sourcePath: '/assets/guide.png',
          replacement: 'https://assets.example/uploaded-guide.png',
        },
      ],
    })
    expect(uploaded.plan.entries[0]?.bodyMdc).toBe(
      '# Guide\n![Guide](https://assets.example/uploaded-guide.png)',
    )
    expect(uploaded.plan.assets).toEqual([])
  })

  it('maps content semantics instead of preserving filesystem-only details as CMS truth', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-mapping-'))
    mkdirSync(join(rootDir, 'collections'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'authors'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'docs', 'workflows'), { recursive: true })
    writeFileSync(
      join(rootDir, 'collections', 'docs.json'),
      JSON.stringify({
        slug: 'docs',
        label: { en: 'Docs' },
        type: 'tree',
        routing: { mode: 'route', pathPrefix: '/docs' },
        locales: ['en', 'de'],
        fields: [
          { key: 'title', type: 'text', required: true, localized: true },
          { key: 'description', type: 'textarea', localized: true },
          { key: 'summary', type: 'textarea', localized: true },
          { key: 'author', type: 'relation', relation: { collectionId: 'authors' } },
          { key: 'tags', type: 'multiselect' },
        ],
      }),
    )
    writeFileSync(
      join(rootDir, 'collections', 'authors.json'),
      JSON.stringify({
        slug: 'authors',
        label: { en: 'Authors' },
        type: 'flat',
        routing: { mode: 'none', pathPrefix: '' },
        locales: ['en'],
        fields: [{ key: 'name', type: 'text', required: true }],
      }),
    )
    writeFileSync(
      join(rootDir, 'content', 'authors', 'matthias.yml'),
      ['stableId: author-matthias', 'name: Matthias'].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'docs', 'workflows', '_navigation.yml'),
      [
        'locale: de',
        'title: Workflows',
        'navigation:',
        '  - content-routing',
        '  - launch-checklist',
      ].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'docs', 'workflows', 'index.md'),
      [
        '---',
        'stableId: docs-workflows',
        'locale: de',
        'title: Workflows',
        '---',
        '# Workflows',
      ].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'docs', 'workflows', 'content-routing.md'),
      [
        '---',
        'stableId: docs-content-routing',
        'locale: de',
        'title: Content Routing',
        'description: Route content across locales.',
        'summary: German route summary',
        'author: matthias',
        'tags: [routing, content]',
        'sitemap: false',
        'search: true',
        'navigation: true',
        'seo:',
        '  title: Content Routing Guide',
        '  noindex: false',
        'unknownBadge: Keep me visible as drift',
        '---',
        '# Content Routing',
        '',
        '::callout',
        'MDC body remains the canonical editable source.',
        '::',
      ].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'docs', 'workflows', 'launch-checklist.md'),
      [
        '---',
        'stableId: docs-launch-checklist',
        'locale: de',
        'title: Launch Checkliste',
        '---',
        '# Launch Checkliste',
      ].join('\n'),
    )

    const plan = await createFilesystemMigrationPlan({ rootDir })

    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: 'authors',
          stableId: 'author-matthias',
          routePath: '',
          slug: 'matthias',
          shared: { name: 'Matthias' },
        }),
      ]),
    )
    expect(plan.navigation).toEqual([
      expect.objectContaining({
        collection: 'docs',
        locale: 'de',
        path: '/docs/workflows',
        title: 'Workflows',
        order: ['content-routing', 'launch-checklist'],
      }),
    ])
    const contentRouting = plan.entries.find((entry) => entry.stableId === 'docs-content-routing')
    expect(contentRouting).toMatchObject({
      collection: 'docs',
      stableId: 'docs-content-routing',
      parentStableId: 'docs-workflows',
      orderRank: '000000',
      locale: 'de',
      routePath: '/docs/workflows/content-routing',
      slug: 'content-routing',
      shared: {
        author: 'author-matthias',
        tags: ['routing', 'content'],
        unknownBadge: 'Keep me visible as drift',
      },
      localized: {
        title: 'Content Routing',
        description: 'Route content across locales.',
        summary: 'German route summary',
      },
      public: {
        sitemap: false,
        search: true,
        navigation: true,
      },
      seo: {
        title: 'Content Routing Guide',
        noindex: false,
      },
      relationReferences: [
        {
          field: 'author',
          collection: 'authors',
          value: 'matthias',
        },
      ],
    })
    const launchChecklist = plan.entries.find((entry) => entry.stableId === 'docs-launch-checklist')
    expect(launchChecklist).toMatchObject({
      parentStableId: 'docs-workflows',
      orderRank: '000001',
    })
    expect(contentRouting?.bodyMdc).toContain('::callout')
    expect(plan.warnings).toEqual([
      expect.objectContaining({
        code: 'unknown_frontmatter_field',
        message: expect.stringContaining('unknownBadge'),
      }),
    ])
  })

  it('rejects data files in route-backed collections instead of inventing routes', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-data-route-drift-'))
    mkdirSync(join(rootDir, 'collections'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'docs'), { recursive: true })
    writeFileSync(
      join(rootDir, 'collections', 'docs.json'),
      JSON.stringify({
        slug: 'docs',
        label: { en: 'Docs' },
        type: 'tree',
        routing: { mode: 'route', pathPrefix: '/docs' },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true }],
      }),
    )
    writeFileSync(join(rootDir, 'content', 'docs', 'metadata.yml'), 'title: Metadata')

    const plan = await createFilesystemMigrationPlan({ rootDir })

    expect(plan.entries).toHaveLength(0)
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({
        code: 'data_file_requires_data_collection',
        message: expect.stringContaining('route-backed collection'),
      }),
    )
  })

  it('warns instead of guessing ambiguous or unresolved relation strings', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-relation-drift-'))
    mkdirSync(join(rootDir, 'collections'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'docs', 'guides'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'blog'), { recursive: true })
    writeFileSync(
      join(rootDir, 'collections', 'docs.json'),
      JSON.stringify({
        slug: 'docs',
        label: { en: 'Docs' },
        type: 'tree',
        routing: { mode: 'route', pathPrefix: '/docs' },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true }],
      }),
    )
    writeFileSync(
      join(rootDir, 'collections', 'blog.json'),
      JSON.stringify({
        slug: 'blog',
        label: { en: 'Blog' },
        type: 'flat',
        routing: { mode: 'route', pathPrefix: '/blog' },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true },
          { key: 'related', type: 'relation', relation: { collectionId: 'docs' } },
          { key: 'more', type: 'relations', relation: { collectionId: 'docs' } },
        ],
      }),
    )
    writeFileSync(
      join(rootDir, 'content', 'docs', 'intro.md'),
      ['---', 'stableId: docs-intro-root', 'title: Intro', '---', '# Intro'].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'docs', 'guides', 'intro.md'),
      ['---', 'stableId: docs-intro-guide', 'title: Intro Guide', '---', '# Intro'].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'blog', 'launch.md'),
      [
        '---',
        'title: Launch',
        'related: intro',
        'more: [docs-intro-root, missing-doc]',
        '---',
        '# Launch',
      ].join('\n'),
    )

    const plan = await createFilesystemMigrationPlan({ rootDir })
    const launch = plan.entries.find((entry) => entry.stableId === 'blog:launch')

    expect(launch?.shared).toMatchObject({
      related: 'intro',
      more: ['docs-intro-root', 'missing-doc'],
    })
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ambiguous_relation_reference',
          message: expect.stringContaining('intro'),
        }),
        expect.objectContaining({
          code: 'unresolved_relation_reference',
          message: expect.stringContaining('missing-doc'),
        }),
      ]),
    )
  })

  it('reports wrong required field types as blocking migration drift', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-field-drift-'))
    mkdirSync(join(rootDir, 'collections'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'blog'), { recursive: true })
    writeFileSync(
      join(rootDir, 'collections', 'blog.json'),
      JSON.stringify({
        slug: 'blog',
        label: { en: 'Blog' },
        type: 'flat',
        routing: { mode: 'route', pathPrefix: '/blog' },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', required: true, localized: true },
          { key: 'readingTime', type: 'number', required: true },
        ],
      }),
    )
    writeFileSync(
      join(rootDir, 'content', 'blog', 'launch.md'),
      ['---', 'title: Launch', 'readingTime: five', '---', '# Launch'].join('\n'),
    )

    const plan = await createFilesystemMigrationPlan({ rootDir })

    expect(plan.warnings).toContainEqual(
      expect.objectContaining({
        code: 'invalid_required_field_type',
        message: expect.stringContaining('readingTime'),
      }),
    )
  })

  it('reports route and canonical-key conflicts as import blockers', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-route-conflict-'))
    mkdirSync(join(rootDir, 'collections'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'blog'), { recursive: true })
    writeFileSync(
      join(rootDir, 'collections', 'blog.json'),
      JSON.stringify({
        slug: 'blog',
        label: { en: 'Blog' },
        type: 'flat',
        routing: { mode: 'route', pathPrefix: '/blog' },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true }],
      }),
    )
    writeFileSync(
      join(rootDir, 'content', 'blog', 'launch.md'),
      ['---', 'stableId: launch-md', 'title: Launch', '---', '# Launch'].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'blog', 'launch.mdc'),
      ['---', 'stableId: launch-mdc', 'title: Launch Duplicate', '---', '# Launch'].join('\n'),
    )

    const plan = await createFilesystemMigrationPlan({ rootDir })

    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'route_conflict',
          message: expect.stringContaining('launch-md'),
        }),
        expect.objectContaining({
          code: 'duplicate_canonical_key',
          message: expect.stringContaining('blog/launch'),
        }),
      ]),
    )
  })

  it('reports the remaining dry-run blockers from canonical import records', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-import-blockers-'))
    mkdirSync(join(rootDir, 'collections'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'authors'), { recursive: true })
    mkdirSync(join(rootDir, 'content', 'blog'), { recursive: true })
    writeFileSync(
      join(rootDir, 'collections', 'authors.json'),
      JSON.stringify({
        slug: 'authors',
        label: { en: 'Authors' },
        type: 'flat',
        routing: { mode: 'none', pathPrefix: '' },
        locales: ['en'],
        fields: [{ key: 'name', type: 'text', required: true }],
      }),
    )
    writeFileSync(
      join(rootDir, 'collections', 'blog.json'),
      JSON.stringify({
        slug: 'blog',
        label: { en: 'Blog' },
        type: 'flat',
        routing: { mode: 'route', pathPrefix: '/blog' },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', required: true, localized: true },
          { key: 'summary', type: 'textarea', required: true, localized: true },
          { key: 'hero', type: 'image' },
          { key: 'author', type: 'relation', relation: { collectionId: 'authors' } },
        ],
      }),
    )
    writeFileSync(
      join(rootDir, 'content', 'blog', 'launch.md'),
      [
        '---',
        'stableId: blog-launch',
        'title: Launch',
        'hero: /assets/missing.png',
        'author: missing-author',
        'extraBadge: Unknown',
        '---',
        '# Launch',
      ].join('\n'),
    )
    writeFileSync(
      join(rootDir, 'content', 'blog', 'launch-duplicate.md'),
      ['---', 'stableId: blog-launch', 'title: Launch Duplicate', 'summary: Duplicate', '---'].join(
        '\n',
      ),
    )

    const plan = await createFilesystemMigrationPlan({ rootDir })

    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_asset',
          message: expect.stringContaining('/assets/missing.png'),
        }),
        expect.objectContaining({
          code: 'unresolved_relation_reference',
          message: expect.stringContaining('missing-author'),
        }),
        expect.objectContaining({
          code: 'schema_mismatch',
          message: expect.stringContaining('summary'),
        }),
        expect.objectContaining({
          code: 'locale_conflict',
          message: expect.stringContaining('blog:blog-launch:en'),
        }),
        expect.objectContaining({
          code: 'unknown_frontmatter_field',
          message: expect.stringContaining('extraBadge'),
        }),
      ]),
    )
  })
})
