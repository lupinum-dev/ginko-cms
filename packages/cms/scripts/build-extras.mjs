// Build the additional top-level source directories (auth, cli,
// portability, public, server)
// into dist/. nuxt-module-build only handles src/runtime/, so we run mkdist
// for the rest. This keeps the Nuxt module package surface explicit.
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mkdist } from 'mkdist'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')

const extras = [
  'auth',
  'cli',
  'convex',
  'module',
  'nuxt-provider',
  'portability',
  'public',
  'server',
]

function walkFiles(directory) {
  const entries = []
  for (const entry of readdirSync(directory)) {
    const fullPath = resolve(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      entries.push(...walkFiles(fullPath))
      continue
    }
    entries.push(fullPath)
  }
  return entries
}

function normalizeDeclarationSpecifiers(directory) {
  for (const filePath of walkFiles(directory)) {
    if (!filePath.endsWith('.d.ts')) continue
    const source = readFileSync(filePath, 'utf8')
    const normalized = source.replaceAll('.js.js', '.js')
    if (normalized !== source) {
      writeFileSync(filePath, normalized, 'utf8')
    }
  }
}

for (const dir of extras) {
  const srcDir = resolve(pkgRoot, 'src', dir)
  const distSubDir = resolve(pkgRoot, 'dist', dir)
  const result = await mkdist({
    rootDir: pkgRoot,
    srcDir: `src/${dir}`,
    distDir: `dist/${dir}`,
    cleanDist: dir === 'server',
    declaration: dir !== 'server',
    addRelativeDeclarationExtensions: true,
    ext: 'js',
    pattern: [
      '**',
      '!**/*.stories.{js,cts,mts,ts,jsx,tsx}',
      '!**/*.{spec,test}.{js,cts,mts,ts,jsx,tsx}',
      '!**/tsconfig.json',
    ],
    esbuild: {
      jsxImportSource: 'vue',
      jsx: 'automatic',
      jsxFactory: 'h',
      target: 'esnext',
    },
  })
  console.log(`[build-extras] ${dir}: ${result.writtenFiles.length} files -> dist/${dir}`)
  normalizeDeclarationSpecifiers(distSubDir)
  // Reference srcDir/distSubDir for documentation; mkdist resolves paths via rootDir+srcDir/distDir.
  void srcDir
}

normalizeDeclarationSpecifiers(resolve(pkgRoot, 'dist'))

copyFileSync(
  resolve(pkgRoot, 'src/cli/convex-package-json-shim.cjs'),
  resolve(pkgRoot, 'dist/cli/convex-package-json-shim.cjs'),
)
const providerResult = await mkdist({
  rootDir: pkgRoot,
  srcDir: 'src',
  distDir: 'dist',
  cleanDist: false,
  declaration: true,
  addRelativeDeclarationExtensions: true,
  ext: 'mjs',
  pattern: ['nuxt-provider.ts'],
  esbuild: { target: 'esnext' },
})
normalizeDeclarationSpecifiers(resolve(pkgRoot, 'dist'))
console.log(`[build-extras] nuxt-provider entry: ${providerResult.writtenFiles.length} files`)
