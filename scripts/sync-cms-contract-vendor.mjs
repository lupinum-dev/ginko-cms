import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const check = process.argv.includes('--check')
const repoRoot = resolve(import.meta.dirname, '..')
const compatibility = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/cms/compatibility.json'), 'utf8'),
)
const sourceArtifact = compatibility.releaseArtifacts['@lupinum/ginko-content']
const vendorManifestPath = resolve(
  repoRoot,
  'packages/convex/src/lib/cmsContract/vendor-manifest.json',
)
const targetRoot = resolve(repoRoot, 'packages/convex/src/lib/cmsContract')

const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

if (check) {
  const manifest = JSON.parse(readFileSync(vendorManifestPath, 'utf8'))
  if (
    manifest.packageVersion !== compatibility.releaseStack['@lupinum/ginko-content'] ||
    manifest.sourceCommit !== sourceArtifact.sourceCommit
  ) {
    throw new Error('cmsContract vendor manifest does not match compatibility.json.')
  }
  const drift = Object.entries(manifest.files)
    .filter(([name, expected]) => hashFile(resolve(targetRoot, name)) !== expected)
    .map(([name]) => name)
  if (drift.length) {
    throw new Error(
      `cmsContract vendor drift detected: ${drift.join(', ')}. Regenerate with the pinned Ginko Content checkout.`,
    )
  }
  console.log('cmsContract vendor checksums match the pinned source manifest.')
  process.exit(0)
}

if (!process.env.GINKO_CONTENT_ROOT) {
  throw new Error(
    'Vendor regeneration requires GINKO_CONTENT_ROOT at the pinned Ginko Content checkout.',
  )
}
const contentRoot = resolve(process.env.GINKO_CONTENT_ROOT)
const git = (...args) =>
  execFileSync('git', ['-C', contentRoot, ...args], { encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) {
  throw new Error('GINKO_CONTENT_ROOT must be a clean checkout before vendor regeneration.')
}
const sourceCommit = git('rev-parse', 'HEAD')
if (sourceCommit !== sourceArtifact.sourceCommit) {
  throw new Error(
    `GINKO_CONTENT_ROOT is at ${sourceCommit}; expected ${sourceArtifact.sourceCommit}.`,
  )
}
const sourcePackage = JSON.parse(
  readFileSync(resolve(contentRoot, 'packages/content/package.json'), 'utf8'),
)
if (sourcePackage.version !== compatibility.releaseStack['@lupinum/ginko-content']) {
  throw new Error(
    `GINKO_CONTENT_ROOT contains ${sourcePackage.name}@${sourcePackage.version}; expected ${compatibility.releaseStack['@lupinum/ginko-content']}.`,
  )
}
const canonicalRoot = resolve(contentRoot, 'packages/content/src')

const generatedHeader = (source) => `/**
 * Generated from \`@lupinum/ginko-content/cms-contract\`.
 *
 * Source: ${source}
 *
 * Do not edit by hand. Run \`pnpm run sync:cms-contract-vendor\`.
 */

`

function readCanonical(relativePath) {
  return readFileSync(resolve(canonicalRoot, relativePath), 'utf8')
}

function withHeader(sourcePath, source) {
  return `${generatedHeader(`ginko-content/packages/content/src/${sourcePath}`)}${source}`
}

function transformSlug() {
  return withHeader('core/content/slug.ts', readCanonical('core/content/slug.ts'))
}

function transformPath() {
  return withHeader(
    'core/content/path.ts',
    readCanonical('core/content/path.ts')
      .replace("from './slug'", "from './slug.js'")
      .replace(
        'const SEMVER_REGEX = /^(\\d+)(\\.\\d+)*(\\.x)?$/',
        'const SEMVER_REGEX = /^\\d+(?:\\.\\d+)*(?:\\.x)?$/',
      )
      .replace(
        'const NUMERIC_PREFIX_RE = /^(\\d+)\\.(.+)$/',
        'const NUMERIC_PREFIX_RE = /^(\\d+)\\..+$/',
      )
      .replace(/\/\\\.draft\(\\\/\|\\\.\|\$\)\//g, '/\\.draft(?:\\/|\\.|$)/')
      .replace(".replace(/(\\d+\\.)?(.*)/, '$2')", ".replace(/(?:\\d+\\.)?(.*)/, '$1')")
      .replace('/^index(\\.draft)?$/', '/^index(?:\\.draft)?$/'),
  )
}

function transformMarkdownTree() {
  return withHeader(
    'core/markdown/tree.ts',
    readCanonical('core/markdown/tree.ts').replace(
      "from '../../types/content'",
      "from './types.js'",
    ),
  )
}

function transformMdc() {
  return withHeader(
    'cms-contract/mdc.ts',
    readCanonical('cms-contract/mdc.ts')
      .replace("from '../types/content.js'", "from './types.js'")
      .replace("from '../core/markdown/tree.js'", "from './markdownTree.js'"),
  )
}

function transformTypes() {
  return `${generatedHeader('ginko-content/packages/content/src/types/content.ts')}
/**
 * Convex-safe subset of ginko-content's content runtime types.
 *
 * The canonical file contains Nuxt/runtime ingestion types that Convex must not
 * import. Keep only the shapes stored on CMS rows and returned by the public
 * provider.
 */

export interface MarkdownNode {
  type: string
  tag?: string
  value?: string
  props?: Record<string, unknown>
  content?: unknown
  children?: MarkdownNode[]
  attributes?: Record<string, unknown>
  fmAttributes?: Record<string, unknown>
}

export interface MarkdownRoot {
  type: 'root'
  children: MarkdownNode[]
  props?: Record<string, unknown>
  toc?: Toc
}

export interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

export interface Toc {
  title: string
  depth: number
  searchDepth: number
  links: TocLink[]
}

export type CmsLocaleCode = string

export interface PublicEntryPayload {
  title: string
  description: string | null
  data: Record<string, unknown>
  bodyMdc: string
  bodyAst: MarkdownRoot
  searchText: string
  toc: Toc | null
}
`
}

function transformIndex() {
  return `${generatedHeader('ginko-content/packages/content/src/cms-contract/index.ts')}
export {
  describeId,
  generatePath,
  generateCanonicalKey,
  generateTitle,
  isDraftPath,
  isPartialPath,
  normalizeContentPath,
  normalizeRouteMounts,
  longestMountForPath,
  routeRemainder,
  mountContentPath,
  prefixPathWithLocale,
  stripLocalePrefix,
  refineUrlPart,
  routeToContentPathCandidates,
  pathHasLocalePrefix,
} from './path.js'

export { slugifyUrlSegment } from './slug.js'

export { parseMdcBody, type ParseMdcBodyOptions, type ParseMdcBodyResult } from './mdc.js'

export {
  extractMarkdownText,
  isMarkdownRoot,
  mapMarkdownNode,
  mapMarkdownNodes,
  toMarkdownNode,
  toMarkdownRoot,
} from './markdownTree.js'

export type {
  CmsLocaleCode,
  MarkdownNode,
  MarkdownRoot,
  PublicEntryPayload,
  Toc,
  TocLink,
} from './types.js'
`
}

const files = new Map([
  ['slug.ts', transformSlug()],
  ['path.ts', transformPath()],
  ['markdownTree.ts', transformMarkdownTree()],
  ['mdc.ts', transformMdc()],
  ['types.ts', transformTypes()],
  ['index.ts', transformIndex()],
])

function formatInPlace(root, names) {
  const result = spawnSync('pnpm', ['exec', 'oxfmt', ...names.map((name) => resolve(root, name))], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    process.exit(result.status || 1)
  }
}

function writeFiles(root) {
  for (const [name, source] of files) {
    writeFileSync(resolve(root, name), source)
  }
  formatInPlace(root, [...files.keys()])
}

writeFiles(targetRoot)
const manifest = {
  package: '@lupinum/ginko-content',
  packageVersion: sourcePackage.version,
  sourceCommit,
  files: Object.fromEntries(
    [...files.keys()].sort().map((name) => [name, hashFile(resolve(targetRoot, name))]),
  ),
}
writeFileSync(vendorManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Synced ${files.size} cms-contract vendor files from ${sourceCommit}.`)
