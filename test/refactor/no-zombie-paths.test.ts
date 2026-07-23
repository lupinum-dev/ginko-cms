import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = new URL('../..', import.meta.url).pathname

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|vue)$/.test(entry.name) ? [path] : []
  })
}

describe('release-clean backend has no old-system zombie paths', () => {
  it('contains no legacy Nuxt MCP server implementation', () => {
    const legacyMcpRoot = join(root, 'packages/cms/src/server/mcp')
    expect(existsSync(legacyMcpRoot) ? sourceFiles(legacyMcpRoot) : []).toEqual([])
    expect(existsSync(join(root, 'packages/cms/src/server/middleware/mcp-auth.ts'))).toBe(false)
  })

  it('imports the Content CMS contract directly without a vendored copy', () => {
    const oldVendorRoot = join(root, 'packages/convex/src/lib/cmsContract')
    expect(existsSync(oldVendorRoot) ? readdirSync(oldVendorRoot) : []).toEqual([])
    expect(readFileSync(join(root, 'package.json'), 'utf8')).not.toContain(
      'sync:cms-contract-vendor',
    )
    expect(readFileSync(join(root, 'MAINTAINING.md'), 'utf8')).not.toContain(
      'sync:cms-contract-vendor',
    )
    const directConsumers = [
      'packages/convex/src/entries/workflow/draftCommands.ts',
      'packages/convex/src/entries/workflow/path.ts',
      'packages/convex/src/entries/workflow/projectionBuild.ts',
    ]
    for (const file of directConsumers) {
      expect(readFileSync(join(root, file), 'utf8')).toContain(
        "from '@lupinum/ginko-content/cms-contract'",
      )
    }
  })

  it('keeps public content API reads on published projections only', () => {
    const publicRoot = join(root, 'packages/convex/src')
    const implementationFiles = [
      join(publicRoot, 'public.ts'),
      join(publicRoot, 'publicPagination.ts'),
      join(publicRoot, 'publicProjectionReads.ts'),
      join(publicRoot, 'publicReadAdapter.ts'),
      ...sourceFiles(join(publicRoot, 'publicReads')),
    ]
    const source = implementationFiles.map((path) => readFileSync(path, 'utf8')).join('\n')
    const forbidden = [
      /\.query\(['"]entries['"]\)/,
      /\.query\(['"]entryDrafts['"]\)/,
      /\.query\(['"]entryRevisions['"]\)/,
      /\bctx\.db\.get\(/,
    ]

    expect(
      forbidden.filter((pattern) => pattern.test(source)).map(String),
      'public read modules must not read draft/editor/source-of-truth content tables',
    ).toEqual([])
  })

  it('keeps portability CLI-only and asset recovery distinct from database backup', () => {
    const studioSource = [
      ...sourceFiles(join(root, 'packages/cms/studio-app/src')),
      ...sourceFiles(join(root, 'packages/cms/src/public')),
    ]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')
    expect(studioSource).not.toContain('storageImportRuns')
    expect(studioSource).not.toContain('/studio/imports')
    expect(existsSync(join(root, 'packages/cms/studio-app/src/pages/imports.vue'))).toBe(false)

    const convexSource = sourceFiles(join(root, 'packages/convex/src'))
      .filter((path) => !path.includes('/_generated/'))
      .filter((path) => !path.includes('/portability/'))
      .filter((path) => !path.endsWith('/schema.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')
    expect(convexSource).not.toMatch(/\bBACKUP_[A-Z_]+\b/)
    expect(convexSource).not.toContain('collectionId')
    expect(convexSource).not.toContain('SITE_DATA_LOCALIZATION_CHANGE_REQUIRES_MIGRATION')
  })

  it('keeps generated Convex function types intact across host facades', () => {
    const facadeSource = sourceFiles(join(root, 'packages/cms/templates/convex/ginkoCms'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(facadeSource).not.toMatch(/\bas never\b/)
    expect(facadeSource).not.toMatch(/\bas any\b/)
    expect(facadeSource).not.toContain('unknown as')
  })
})
