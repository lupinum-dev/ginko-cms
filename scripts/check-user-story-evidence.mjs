import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const catalogPath = resolve(repoRoot, 'userstories.md')
const evidencePath = resolve(repoRoot, 'test/refactor/story-evidence.json')
const testRoot = resolve(repoRoot, 'test')
const storyPattern = /^### ([A-Z]{3}-\d{2}):/gm
const titleStoryPrefixPattern = /^(?:\[([A-Z]{3}-\d{2})\])+/u
const titleStoryPattern = /\[([A-Z]{3}-\d{2})\]/gu

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

function relativeToRepo(absolutePath) {
  return absolutePath.slice(repoRoot.length + 1)
}

function listTestFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listTestFiles(absolutePath))
      continue
    }
    if (entry.isFile() && /\.test\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(absolutePath)
  }
  return files
}

function callRootIdentifier(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return callRootIdentifier(expression.expression)
  }
  if (ts.isCallExpression(expression)) return callRootIdentifier(expression.expression)
  return null
}

function literalTestTitle(argument) {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.text
  }
  return null
}

export function discoverExecutableStoryEvidence() {
  const cases = []
  for (const absolutePath of listTestFiles(testRoot)) {
    const source = readFileSync(absolutePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      absolutePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      extname(absolutePath).includes('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ['it', 'test'].includes(callRootIdentifier(node.expression))
      ) {
        const title = node.arguments[0] ? literalTestTitle(node.arguments[0]) : null
        if (title && titleStoryPrefixPattern.test(title)) {
          const storyIds = [...title.matchAll(titleStoryPattern)].map((match) => match[1])
          cases.push({
            file: relativeToRepo(absolutePath),
            title,
            storyIds,
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return cases.sort((left, right) =>
    `${left.file}\u0000${left.title}`.localeCompare(`${right.file}\u0000${right.title}`),
  )
}

export function buildUserStoryEvidenceReport() {
  if (!existsSync(catalogPath) || !statSync(catalogPath).isFile()) {
    throw new Error('userstories.md is missing.')
  }
  const catalog = readFileSync(catalogPath, 'utf8')
  const catalogIds = [...catalog.matchAll(storyPattern)].map((match) => match[1])
  if (catalogIds.length !== unique(catalogIds).length) {
    throw new Error('userstories.md contains duplicate story IDs.')
  }

  const manifest = JSON.parse(readFileSync(evidencePath, 'utf8'))
  if (
    manifest.schemaVersion !== 2 ||
    Object.keys(manifest).some((key) => !['schemaVersion', 'deferred'].includes(key))
  ) {
    throw new Error(
      'Story evidence manifest must use schemaVersion 2 and contain only the deferred catalog.',
    )
  }

  const acceptedIds = catalogIds.filter((id) => !id.startsWith('CND-'))
  const deferredIds = catalogIds.filter((id) => id.startsWith('CND-'))
  const declaredDeferredIds = manifest.deferred ?? []
  if (!Array.isArray(declaredDeferredIds)) {
    throw new Error('Story evidence manifest deferred value must be an array.')
  }
  assertEqualSet('Deferred story catalog', declaredDeferredIds, deferredIds)

  const cases = discoverExecutableStoryEvidence()
  const taggedIds = unique(cases.flatMap((testCase) => testCase.storyIds))
  const unknownIds = difference(taggedIds, catalogIds)
  if (unknownIds.length > 0) {
    throw new Error(
      `Executable tests reference unknown story IDs: ${sorted(unknownIds).join(', ')}.`,
    )
  }

  const mappings = Object.fromEntries(
    acceptedIds.map((storyId) => [
      storyId,
      cases
        .filter((testCase) => testCase.storyIds.includes(storyId))
        .map(({ file, title }) => ({ file, test: title })),
    ]),
  )
  const unmappedIds = acceptedIds.filter((storyId) => mappings[storyId].length === 0)
  if (unmappedIds.length > 0) {
    throw new Error(
      `Accepted stories without an executable test case: ${sorted(unmappedIds).join(', ')}. ` +
        'Prefix a relevant Vitest title with the story ID, for example "[ACC-01] ...".',
    )
  }

  const deferredEvidence = Object.fromEntries(
    deferredIds.map((storyId) => [
      storyId,
      cases
        .filter((testCase) => testCase.storyIds.includes(storyId))
        .map(({ file, title }) => ({ file, test: title })),
    ]),
  )
  const evidenceFiles = unique(
    Object.values(mappings)
      .flat()
      .map((entry) => entry.file),
  )

  return {
    schemaVersion: 2,
    catalog: 'userstories.md',
    accepted: sorted(acceptedIds),
    deferred: sorted(deferredIds),
    evidenceFiles: sorted(evidenceFiles),
    mappings,
    deferredEvidence,
  }
}

function runCli() {
  const report = buildUserStoryEvidenceReport()
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }
  console.log(
    `User-story evidence is complete: ${report.accepted.length} accepted stories mapped to exact executable cases in ${report.evidenceFiles.length} test files; ${report.deferred.length} CND stories explicitly deferred.`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
}
