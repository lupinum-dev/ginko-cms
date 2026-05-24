/// <reference types="vite/client" />

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import * as canonical from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import * as convexVendor from '../../packages/convex/src/lib/cmsContract/index.js'

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures')

const pathCases = [
  'docs/01.Getting Started',
  'docs/API/v1.2.x',
  'blog/Über uns & Preise',
  'guide/index',
  'guide/index.draft',
  'release/2026.05.notes',
  'A/B Test + Email@Home',
]

const canonicalKeyCases: Array<{
  parts: string[]
  options?: { translatedSlugs?: boolean; respectPathCase?: boolean }
}> = [
  { parts: ['docs', '01.Getting Started'] },
  { parts: ['docs', '01.Getting Started'], options: { translatedSlugs: true } },
  { parts: ['Docs', 'API'], options: { respectPathCase: true } },
  { parts: ['blog', 'Über uns & Preise'] },
]

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.md') || name.endsWith('.mdc'))
    .sort()
}

function splitFrontmatter(raw: string): { body: string } {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  return { body: match?.[1] ?? raw }
}

describe('cms-contract Convex vendor parity', () => {
  for (const fixture of listFixtures()) {
    it(`matches canonical parseMdcBody output for ${fixture}`, async () => {
      const raw = readFileSync(resolve(FIXTURES_DIR, fixture), 'utf8')
      const { body } = splitFrontmatter(raw)

      await expect(convexVendor.parseMdcBody(body)).resolves.toEqual(
        await canonical.parseMdcBody(body),
      )
    })
  }

  it('matches canonical path helpers', () => {
    for (const input of pathCases) {
      expect(convexVendor.generatePath(input)).toBe(canonical.generatePath(input))
      expect(convexVendor.generateTitle(input)).toBe(canonical.generateTitle(input))
      expect(convexVendor.describeId(`content:${input}.md`)).toEqual(
        canonical.describeId(`content:${input}.md`),
      )
    }

    for (const testCase of canonicalKeyCases) {
      expect(convexVendor.generateCanonicalKey(testCase.parts, testCase.options)).toBe(
        canonical.generateCanonicalKey(testCase.parts, testCase.options),
      )
    }
  })
})
