import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const check = process.argv.includes('--check')
const repoRoot = resolve(import.meta.dirname, '..')
const contentRoot = resolve(
  process.env.GINKO_CONTENT_ROOT || resolve(repoRoot, '..', 'ginko-content'),
)
const canonicalRoot = resolve(contentRoot, 'packages/content/src')
const targetRoot = resolve(repoRoot, 'packages/convex/src/lib/cmsContract')

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
  projectContentPathToLocale,
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

if (!check) {
  writeFiles(targetRoot)
  console.log(`Synced ${files.size} cms-contract vendor files.`)
  process.exit(0)
}

const tempRoot = mkdtempSync(resolve(tmpdir(), 'ginko-cms-contract-vendor-'))
try {
  writeFiles(tempRoot)
  const drift = []
  for (const name of files.keys()) {
    const expected = readFileSync(resolve(tempRoot, name), 'utf8')
    const actual = readFileSync(resolve(targetRoot, name), 'utf8')
    if (expected !== actual) drift.push(name)
  }
  if (drift.length) {
    console.error(
      `cmsContract vendor drift detected: ${drift.join(', ')}. Run \`pnpm run sync:cms-contract-vendor\`.`,
    )
    process.exit(1)
  }
  console.log('cmsContract vendor files are in sync.')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
