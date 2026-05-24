import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeDir = resolve(packageRoot, 'packages/cms/src/runtime')

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(target) : [target]
  })
}

describe('ginko-cms theme contract', () => {
  it('does not use legacy hsl(var(--token)) runtime colors', () => {
    const offenders = listFiles(runtimeDir)
      .filter((file) => /\.(?:css|vue)$/.test(file))
      .filter((file) => readFileSync(file, 'utf-8').includes('hsl(var(--'))

    expect(offenders).toEqual([])
  })
})
