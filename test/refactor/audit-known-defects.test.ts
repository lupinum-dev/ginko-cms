import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

function source(file: string) {
  return readFileSync(resolve(root, file), 'utf8')
}

function section(contents: string, start: string, end?: string) {
  const startIndex = contents.indexOf(start)
  expect(startIndex, `Missing start marker: ${start}`).toBeGreaterThanOrEqual(0)
  const endIndex = end ? contents.indexOf(end, startIndex + start.length) : contents.length
  expect(endIndex, `Missing end marker: ${end}`).toBeGreaterThan(startIndex)
  return contents.slice(startIndex, endIndex)
}

/**
 * Executable contracts for confirmed audit findings.
 *
 * These source-level drift guards complement the executed behavior and
 * query-count regressions; they are not substitutes for those tests.
 */
describe('known audit defects', () => {
  it('reads an entry draft public projection through the existing entry index', () => {
    const body = section(
      source('packages/convex/src/entries/context.ts'),
      'export async function readStudioDraftView(',
      'async function latestPublishedShared(',
    )

    expect(body).toContain(".withIndex('by_entry_locale'")
  })

  it('reads version publication state through the existing entry index', () => {
    const body = section(
      source('packages/convex/src/entries/read.ts'),
      'export const listVersions =',
    )

    expect(body).toContain(".withIndex('by_entry_locale'")
  })

  it('checks draft path ownership through canonical siblings and explicit move-ins', () => {
    const body = source('packages/convex/src/entries/draftPathConflicts.ts')
    expect(body).toContain(".withIndex('by_parent'")
    expect(body).toContain(".withIndex('by_parent_override'")
    expect(body).not.toContain("q.field('collectionId')")
    expect(body).not.toContain("query('publicEntries')")
    expect(body).not.toContain('readStudioDraftView')
    expect(body).not.toContain("from './context.js'")
    expect(body).toContain('effectiveDraftParent')
    expect(body).toContain('effectiveDraftSlug')
  })

  it('uses the shared indexed sibling validator for reparenting', () => {
    const body = source('packages/convex/src/entries/tree.ts')
    expect(body).toContain('assertNoDraftSiblingPathConflict(ctx')
    expect(body).not.toContain(".withIndex('by_collection_status'")
  })

  it('loads a site-data deletion target through the existing key index', () => {
    const body = section(
      source('packages/convex/src/siteData.ts'),
      'export const deleteSiteDataBlockOperation =',
      'export const deleteSiteDataBlockOperationExecute =',
    )

    expect(body).toContain(".withIndex('by_key'")
  })

  it('does not resolve asset entry metadata serially inside the usage-row loop', () => {
    const body = section(
      source('packages/convex/src/assets.ts'),
      'async function loadAssetRelationships(',
      'async function resolveEntryMetaForAssetRef(',
    )

    expect(body).not.toMatch(/for \(const row of rows\)[\s\S]*await resolveEntryMetaForAssetRef/)
    expect(body).not.toContain('readStudioDraftView')
    expect(body).toContain('createDraftEntryTitleResolver')
  })

  it('keeps the asset-browser orchestration seam within the reviewed shell budget', () => {
    const lines = source(
      'packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext.ts',
    ).split('\n').length

    expect(lines).toBeLessThanOrEqual(480)
  })
})
