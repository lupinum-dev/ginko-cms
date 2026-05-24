import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = new URL('../..', import.meta.url).pathname
const scanRoots = [
  'packages/convex/src',
  'packages/cms/src',
  'packages/contract/src',
  'test/component',
  'test/refactor',
]

const blocked = [
  /\bentryLocales\b/,
  /\bentryVersions\b/,
  /\bdraftHistory\b/,
  /\bstudioEntries\b/,
  /\bpublicNavTrees\b/,
  /\bpublicSitemapEntries\b/,
  /\bpublicTranslationSummaries\b/,
  /\bpublicProjectionRuns\b/,
  /\bassetUsages\b/,
  /\bsaveSlugDraft\b/,
  /\bsaveSharedDraft\b/,
  /\bsaveLocalizedDraft\b/,
]

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (path.includes('/_generated/')) continue
    if (path.endsWith('/node_modules')) continue
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...filesUnder(path))
    } else if (/\.(?:ts|tsx|js|mjs|vue)$/.test(name)) {
      files.push(path)
    }
  }
  return files
}

describe('release-clean backend has no old-system zombie paths', () => {
  it('does not reference deleted editorial/projection models or route-specific draft wrappers', () => {
    const offenders: string[] = []
    for (const relativeRoot of scanRoots) {
      for (const file of filesUnder(join(root, relativeRoot))) {
        if (file.endsWith('/no-zombie-paths.test.ts')) continue
        const source = readFileSync(file, 'utf8')
        for (const pattern of blocked) {
          if (pattern.test(source)) {
            offenders.push(`${file.replace(root, '')}: ${pattern}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
