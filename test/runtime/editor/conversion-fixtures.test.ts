import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateTiptapDocShape } from '../../../packages/cms/studio-app/src/editor/lib/conversionInvariants'
import {
  convertMarkdownToTiptapDoc,
  convertTiptapDocToMarkdown,
} from '../../../packages/cms/studio-app/src/editor/lib/conversionPipeline'

const fixturesDir = join(process.cwd(), 'test', 'fixtures', 'editor-conversion')

async function listFixtures() {
  const entries = await readdir(fixturesDir)
  return entries.filter((entry) => entry.endsWith('.mdc')).sort()
}

async function readFixture(name: string) {
  return readFile(join(fixturesDir, name), 'utf8')
}

async function normalizeMarkdown(markdown: string) {
  const toDoc = await convertMarkdownToTiptapDoc(markdown)
  expect(toDoc.ok).toBe(true)
  expect(toDoc.value).toBeTruthy()
  const doc = toDoc.value!
  expect(validateTiptapDocShape(doc)).toEqual([])

  const toMarkdown = await convertTiptapDocToMarkdown(doc)
  expect(toMarkdown.ok).toBe(true)
  expect(toMarkdown.value).toBeTypeOf('string')

  return toMarkdown.value!
}

const fixtures = await listFixtures()

describe('editor conversion fixtures', () => {
  it('includes at least one fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fixture of fixtures) {
    it(`round-trips ${fixture} with stable normalized output`, async () => {
      const input = await readFixture(fixture)
      const normalized = await normalizeMarkdown(input)
      const normalizedTwice = await normalizeMarkdown(normalized)
      const normalizedThrice = await normalizeMarkdown(normalizedTwice)

      expect(normalizedThrice).toBe(normalizedTwice)
      expect(normalizedTwice.length).toBeGreaterThan(0)
    })
  }
})
