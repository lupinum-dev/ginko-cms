import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(new URL('..', import.meta.url).pathname)
const outDir = resolve(rootDir, 'dist/bridge-manifest')
const sourceDir = resolve(outDir, 'src/module')
const convexDir = resolve(rootDir, 'convex')

rmSync(outDir, { recursive: true, force: true })
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bridge-manifest.json'], {
  cwd: rootDir,
  stdio: 'inherit',
})

mkdirSync(convexDir, { recursive: true })
copyFileSync(resolve(sourceDir, 'bridge-manifest.js'), resolve(convexDir, 'manifest.js'))
copyFileSync(resolve(sourceDir, 'bridge-manifest.d.ts'), resolve(convexDir, 'manifest.d.ts'))

const manifestPath = resolve(convexDir, 'manifest.js')
writeFileSync(
  manifestPath,
  readFileSync(manifestPath, 'utf8').replaceAll(" from '../bridge/", " from '../dist/bridge/"),
  'utf8',
)

execFileSync(
  'pnpm',
  ['exec', 'oxfmt', 'convex/manifest.js', '--ignore-path', '../../.oxfmtignore'],
  {
    cwd: rootDir,
    stdio: 'inherit',
  },
)
