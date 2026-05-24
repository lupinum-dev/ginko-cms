import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'

const ROOT = new URL('..', import.meta.url)
const rootPath = ROOT.pathname
const targetDirectories = [
  'packages/contract/src',
  'packages/convex/src',
  'packages/cms/src/module',
  'packages/cms/src/runtime',
]
const targetFiles = ['packages/cms/src/module.ts', 'packages/cms/src/test.ts']
const allowedExplicitExtensions = ['.js', '.mjs', '.cjs', '.json', '.vue']
const internalAliasPrefixes = ['#component/', '#runtime/']
const ignoredPaths = ['/packages/convex/src/_generated/', '/packages/convex/src/test.setup.ts']
const ignoredFiles = []

function walk(directory) {
  const entries = []
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      entries.push(...walk(fullPath))
      continue
    }
    entries.push(fullPath)
  }
  return entries
}

function collectFiles() {
  const files = []
  for (const file of targetFiles) {
    const fullPath = join(rootPath, file)
    if (statExists(fullPath)) files.push(fullPath)
  }
  for (const directory of targetDirectories) {
    files.push(...walk(join(rootPath, directory)))
  }
  return files.filter((filePath) => {
    const normalized = `/${relative(rootPath, filePath).replaceAll('\\', '/')}`
    if (!normalized.endsWith('.ts')) return false
    if (ignoredFiles.includes(normalized)) return false
    return !ignoredPaths.some((ignoredPath) => normalized.includes(ignoredPath))
  })
}

function statExists(path) {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

function hasAllowedExtension(specifier) {
  return allowedExplicitExtensions.some((extension) => specifier.endsWith(extension))
}

function shouldCheck(specifier) {
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    internalAliasPrefixes.some((prefix) => specifier.startsWith(prefix))
  )
}

const errors = []

function assertNoImpossibleDeclarationSpecifiers() {
  const distRoot = join(rootPath, 'packages/cms/dist')
  if (!statExists(distRoot)) return
  for (const filePath of walk(distRoot)) {
    if (!filePath.endsWith('.d.ts')) continue
    const source = readFileSync(filePath, 'utf8')
    if (source.includes('.js.js')) {
      const relativePath = relative(rootPath, filePath).replaceAll('\\', '/')
      errors.push(`${relativePath} contains invalid declaration specifier ".js.js"`)
    }
  }
}

for (const filePath of collectFiles()) {
  const source = readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  function record(specifier, nodeStart) {
    if (!shouldCheck(specifier) || hasAllowedExtension(specifier)) return
    const { line } = sourceFile.getLineAndCharacterOfPosition(nodeStart)
    const relativePath = relative(rootPath, filePath).replaceAll('\\', '/')
    errors.push(
      `${relativePath}:${line + 1} uses extensionless publish-surface import "${specifier}"`,
    )
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node.moduleSpecifier.text, node.moduleSpecifier.getStart(sourceFile))
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [firstArgument] = node.arguments
      if (firstArgument && ts.isStringLiteral(firstArgument)) {
        record(firstArgument.text, firstArgument.getStart(sourceFile))
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

assertNoImpossibleDeclarationSpecifiers()

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
