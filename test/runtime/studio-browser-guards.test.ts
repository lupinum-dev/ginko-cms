import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../..')

function collectSourceFiles(root: string): string[] {
  const files: string[] = []

  function visit(directory: string) {
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '_generated') continue

      const absolute = resolve(directory, entry)
      const stats = statSync(absolute)
      if (stats.isDirectory()) {
        visit(absolute)
      } else if (/\.(?:ts|vue)$/.test(entry)) {
        files.push(absolute)
      }
    }
  }

  visit(resolve(projectRoot, root))
  return files
}

describe('studio browser guards', () => {
  it('does not use Nuxt-only import.meta.client inside the Vite Studio app', () => {
    const files = collectSourceFiles('packages/cms/studio-app/src')
    const offenders = files
      .filter((file) => readFileSync(file, 'utf8').includes('import.meta.client'))
      .map((file) => file.replace(`${process.cwd()}/`, ''))

    expect(offenders).toEqual([])
  })
})
