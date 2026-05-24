/// <reference types="vite/client" />

/**
 * Gate 0 - Golden fixtures from the canonical filesystem-provider parser.
 *
 * These tests freeze the AST + searchText output of `parseMdcBody` (the
 * pure subpath ginko-cms imports) for a curated set of representative MDC
 * inputs. Once Gate 2 wires the CMS provider to the same parser, the CMS
 * provider must produce byte-identical output for these fixtures.
 *
 * Per the refactor plan, invariant #18: "Golden fixtures come from the
 * canonical filesystem provider, not the current CMS output. The current
 * CMS fakes MDC AST; freezing its output as a baseline would freeze the
 * bug."
 *
 * If a fixture's snapshot needs to change, that's a real change to the
 * AST shape ginko-content emits. The CMS will need to re-render and the
 * test invariant must be re-asserted in the same commit.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseMdcBody } from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures')

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.md') || name.endsWith('.mdc'))
    .sort()
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return { frontmatter: '', body: raw }
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' }
}

describe('Gate 0 - golden MDC parser fixtures', () => {
  const fixtures = listFixtures()

  // Every fixture in the directory MUST be covered. If a developer adds
  // a fixture file but no snapshot exists for it, this test fails first so
  // the miss is loud.
  it('covers every fixture in the directory', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fixture of fixtures) {
    it(`matches snapshot - ${fixture}`, async () => {
      const raw = readFileSync(resolve(FIXTURES_DIR, fixture), 'utf8')
      const { body: bodyRaw } = splitFrontmatter(raw)
      const result = await parseMdcBody(bodyRaw)
      // Snapshot the parsed AST + plaintext + (if present) the TOC.
      // Frontmatter is excluded - it round-trips byte-for-byte and is not
      // part of the parser's responsibility.
      expect({
        body: result.body,
        searchText: result.searchText,
        toc: result.toc ?? null,
      }).toMatchSnapshot()
    })
  }
})
