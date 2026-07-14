import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'ginko-cms-dev-pack-cache-proof-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function runPnpm(args: string[], cwd: string) {
  execFileSync('corepack', ['pnpm', ...args], {
    cwd,
    env: { ...process.env, npm_config_verify_deps_before_run: 'false' },
    stdio: 'pipe',
  })
}

function pack(value: string) {
  const source = resolve(root, 'source')
  const output = resolve(root, 'artifacts')
  mkdirSync(source, { recursive: true })
  mkdirSync(output, { recursive: true })
  writeFileSync(
    resolve(source, 'package.json'),
    `${JSON.stringify({ name: 'ginko-dev-cache-proof', version: '1.0.0', type: 'module', exports: './index.js' })}\n`,
  )
  writeFileSync(resolve(source, 'index.js'), `export default ${JSON.stringify(value)}\n`)
  runPnpm(['pack', '--pack-destination', output], source)
  const packed = readdirSync(output).find((file) => file === 'ginko-dev-cache-proof-1.0.0.tgz')
  if (!packed) throw new Error('Fixture pack did not produce its expected tarball.')
  const temporary = resolve(output, packed)
  const hash = createHash('sha256').update(readFileSync(temporary)).digest('hex')
  const artifact = resolve(output, `ginko-dev-cache-proof-1.0.0-dev.fixture.${hash}.tgz`)
  renameSync(temporary, artifact)
  return artifact
}

function consume(artifact: string, index: number) {
  const consumer = resolve(root, `consumer-${index}`)
  mkdirSync(consumer)
  writeFileSync(
    resolve(consumer, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module', dependencies: { 'ginko-dev-cache-proof': `file:${artifact}` } })}\n`,
  )
  runPnpm(['install', '--ignore-scripts', '--store-dir', resolve(consumer, '.store')], consumer)
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import value from 'ginko-dev-cache-proof'; process.stdout.write(value)",
    ],
    { cwd: consumer, encoding: 'utf8' },
  )
}

describe('development artifact cache isolation', () => {
  it('executes changed bytes from two same-version packs in fresh consumers', () => {
    const first = pack('first build')
    const second = pack('second build')

    expect(first).not.toBe(second)
    expect(consume(first, 1)).toBe('first build')
    expect(consume(second, 2)).toBe('second build')
  })
})
