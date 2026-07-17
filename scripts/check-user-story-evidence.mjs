import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const catalogPath = resolve(repoRoot, 'userstories.md')
const evidencePath = resolve(repoRoot, 'test/refactor/story-evidence.json')
const storyPattern = /^### ([A-Z]{3}-\d{2}):/gm

function unique(values) {
  return [...new Set(values)]
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function difference(left, right) {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value))
}

function assertEqualSet(label, actual, expected) {
  const missing = difference(expected, actual)
  const extra = difference(actual, expected)
  if (missing.length === 0 && extra.length === 0) return
  throw new Error(
    `${label} mismatch. Missing: ${missing.join(', ') || 'none'}. Extra: ${extra.join(', ') || 'none'}.`,
  )
}

export function buildUserStoryEvidenceReport() {
  const catalog = readFileSync(catalogPath, 'utf8')
  const catalogIds = [...catalog.matchAll(storyPattern)].map((match) => match[1])
  if (catalogIds.length !== unique(catalogIds).length) {
    throw new Error('userstories.md contains duplicate story IDs.')
  }

  const manifest = JSON.parse(readFileSync(evidencePath, 'utf8'))
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.groups)) {
    throw new Error('Story evidence manifest must use schemaVersion 1 and contain groups.')
  }

  const acceptedIds = catalogIds.filter((id) => !id.startsWith('CND-'))
  const deferredIds = catalogIds.filter((id) => id.startsWith('CND-'))
  const mappedIds = manifest.groups.flatMap((group) => group.stories ?? [])
  const declaredDeferredIds = manifest.deferred ?? []

  if (mappedIds.length !== unique(mappedIds).length) {
    throw new Error('Story evidence manifest maps at least one accepted story more than once.')
  }
  assertEqualSet('Accepted story evidence', mappedIds, acceptedIds)
  assertEqualSet('Deferred story catalog', declaredDeferredIds, deferredIds)

  const evidenceFiles = []
  const mappings = {}
  for (const group of manifest.groups) {
    if (!Array.isArray(group.stories) || group.stories.length === 0) {
      throw new Error('Every evidence group must contain at least one story.')
    }
    if (!Array.isArray(group.evidence) || group.evidence.length === 0) {
      throw new Error(`Evidence group ${group.stories.join(', ')} has no current evidence.`)
    }
    for (const relativePath of group.evidence) {
      if (
        typeof relativePath !== 'string' ||
        (!relativePath.startsWith('test/') && !relativePath.startsWith('scripts/'))
      ) {
        throw new Error(`Invalid story evidence path: ${String(relativePath)}`)
      }
      const absolutePath = resolve(repoRoot, relativePath)
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        throw new Error(`Mapped story evidence does not exist: ${relativePath}`)
      }
      evidenceFiles.push(relativePath)
    }
    for (const storyId of group.stories) {
      mappings[storyId] = [...group.evidence]
    }
  }

  return {
    schemaVersion: 1,
    catalog: 'userstories.md',
    accepted: sorted(acceptedIds),
    deferred: sorted(deferredIds),
    evidenceFiles: sorted(unique(evidenceFiles)),
    mappings,
  }
}

function runCli() {
  const report = buildUserStoryEvidenceReport()
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }
  console.log(
    `User-story evidence is complete: ${report.accepted.length} accepted stories mapped to ${report.evidenceFiles.length} current evidence files; ${report.deferred.length} CND stories explicitly deferred.`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
}
