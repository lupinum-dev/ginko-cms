import { readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { renderComponentBridgeFiles } from '@lupinum/trellis-bridge/manifest'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

type BridgeKind =
  | 'query'
  | 'mutation'
  | 'action'
  | 'internalQuery'
  | 'internalMutation'
  | 'internalAction'
type SourceKind = 'query' | 'mutation' | 'action'

type BridgeReference = {
  file: string
  wrapperName: string
  bridgeKind: BridgeKind
  targetModule: string
  targetExport: string
}

type SourceExport = {
  file: string
  exportName: string
  sourceKind: SourceKind
  builderName: string
}

type RuntimeBridgeEntry = {
  exportName: string
  operation: BridgeKind
  component: string
}

type RuntimeBridgeRegistryModule = {
  relativePath: string
  componentPath?: string
  entries: readonly RuntimeBridgeEntry[]
}

const repoRoot = resolve(import.meta.dirname, '../..')
const componentRoot = resolve(repoRoot, 'packages/convex/src')
const cmsPackageRoot = resolve(repoRoot, 'packages/cms')

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

function parseSource(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readSource(path), ts.ScriptTarget.Latest, true)
}

async function importCmsManifestFromPackageExport() {
  const packageJson = JSON.parse(readSource(resolve(cmsPackageRoot, 'package.json'))) as {
    exports?: Record<string, { import?: string }>
  }
  const manifestExport = packageJson.exports?.['./convex/manifest']?.import
  if (!manifestExport) {
    throw new Error('@lupinum/ginko-cms must export ./convex/manifest with an import target')
  }

  return await import(pathToFileURL(resolve(cmsPackageRoot, manifestExport)).href)
}

function bridgeKindBase(kind: BridgeKind): SourceKind {
  if (kind.endsWith('Action') || kind === 'action') return 'action'
  return kind.endsWith('Query') || kind === 'query' ? 'query' : 'mutation'
}

function sourceKindForBuilder(builderName: string): SourceKind | null {
  if (builderName.includes('Query')) return 'query'
  if (builderName.includes('Mutation')) return 'mutation'
  if (builderName.includes('Action')) return 'action'
  if (builderName === 'query' || builderName === 'unsafeRaw.query') return 'query'
  if (builderName === 'mutation' || builderName === 'unsafeRaw.mutation') return 'mutation'
  if (builderName === 'action' || builderName === 'callerAction') return 'action'
  return null
}

function directExportsFromFile(file: string): SourceExport[] {
  const sourceFile = parseSource(file)
  const exports: SourceExport[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
    if (!exported) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue
      if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue
      const builderName = declaration.initializer.expression.getText(sourceFile)
      const sourceKind = sourceKindForBuilder(builderName)
      if (!sourceKind) continue
      exports.push({
        file: relative(repoRoot, file),
        exportName: declaration.name.text,
        sourceKind,
        builderName,
      })
    }
  }

  return exports
}

function resolveTypeScriptSource(fromFile: string, specifier: string): string {
  const withoutExtension = specifier.replace(/\.js$/, '')
  return resolve(dirname(fromFile), `${withoutExtension}.ts`)
}

function buildSourceExportIndex(
  moduleName: string,
  visited = new Set<string>(),
): Map<string, SourceExport> {
  return buildSourceExportIndexFromFile(resolveComponentSource(moduleName), visited)
}

function resolveComponentSource(moduleName: string): string {
  const direct = resolve(componentRoot, `${moduleName}.ts`)
  if (statSyncExists(direct)) return direct

  const nested = resolve(componentRoot, 'collections', `${moduleName}.ts`)
  if (statSyncExists(nested)) return nested

  return direct
}

function statSyncExists(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function buildSourceExportIndexFromFile(
  file: string,
  visited: Set<string>,
): Map<string, SourceExport> {
  const exports = new Map<string, SourceExport>()
  if (visited.has(file)) return exports
  visited.add(file)

  for (const exported of directExportsFromFile(file)) {
    exports.set(exported.exportName, exported)
  }

  const sourceFile = parseSource(file)
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) continue

    const targetExports = buildSourceExportIndexFromFile(
      resolveTypeScriptSource(file, statement.moduleSpecifier.text),
      visited,
    )

    if (!statement.exportClause) {
      for (const [exportName, exported] of targetExports) {
        exports.set(exportName, exported)
      }
      continue
    }

    if (!ts.isNamedExports(statement.exportClause)) continue
    for (const element of statement.exportClause.elements) {
      const sourceName = (element.propertyName ?? element.name).text
      const exported = targetExports.get(sourceName)
      if (exported) exports.set(element.name.text, exported)
    }
  }

  return exports
}

function moduleNameFromRegistryModule(module: RuntimeBridgeRegistryModule): string {
  if (module.componentPath) return module.componentPath.split('.').at(-1) ?? module.componentPath
  return module.relativePath.split('/').at(-1)?.replace(/\.ts$/, '') ?? module.relativePath
}

function collectFactoryReferences(
  registry: readonly RuntimeBridgeRegistryModule[],
): BridgeReference[] {
  return registry.flatMap((module) =>
    module.entries.map((entry) => {
      const pathParts = entry.component.split('.')
      return {
        file: module.relativePath,
        wrapperName: entry.exportName,
        bridgeKind: entry.operation,
        targetModule:
          pathParts.length > 1
            ? pathParts.slice(0, -1).join('/')
            : moduleNameFromRegistryModule(module),
        targetExport: pathParts.at(-1) ?? entry.component,
      }
    }),
  )
}

function assertBridgeParity(references: BridgeReference[]): void {
  const exportsByModule = new Map<string, Map<string, SourceExport>>()

  for (const reference of references) {
    let moduleExports = exportsByModule.get(reference.targetModule)
    if (!moduleExports) {
      moduleExports = buildSourceExportIndex(reference.targetModule)
      exportsByModule.set(reference.targetModule, moduleExports)
    }

    const target = moduleExports.get(reference.targetExport)
    if (!target) {
      throw new Error(
        `${reference.file}:${reference.wrapperName} targets missing component export components.ginkoCms.${reference.targetModule}.${reference.targetExport}`,
      )
    }

    expect(
      target.sourceKind,
      `${reference.file}:${reference.wrapperName} kind must match ${target.file}:${target.exportName}`,
    ).toBe(bridgeKindBase(reference.bridgeKind))
  }
}

describe('ginko-cms bridge API parity', () => {
  it('keeps bridge function refs inferred from typed component refs', async () => {
    const { bridgeModuleRegistry } = await import('../../packages/cms/src/bridge/registry')
    const explicitRefs = bridgeModuleRegistry.flatMap((module) =>
      module.entries.flatMap((entry) => {
        const candidate = entry as {
          exportName: string
          functionRef?: string
        }
        if (!candidate.functionRef) return []

        return [
          {
            file: module.relativePath,
            exportName: candidate.exportName,
            functionRef: candidate.functionRef,
          },
        ]
      }),
    )

    expect(explicitRefs).toEqual([])
  })

  it('keeps CLI forwarding paths inferred from collection bridge entries', () => {
    const pushSource = readFileSync(join(cmsPackageRoot, 'src/cli/push.ts'), 'utf8')
    const forwardingSource = readFileSync(join(cmsPackageRoot, 'src/cli/forwarding.ts'), 'utf8')

    expect(pushSource).not.toContain("functionRef: '")
    expect(pushSource).toContain('collectionBridgeFunctionRefs.checkCollectionContracts')
    expect(pushSource).toContain('collectionBridgeFunctionRefs.installCollectionContracts')
    expect(forwardingSource).not.toContain('getFunctionName')
  })

  it('keeps generated bridge modules declared in the central registry', async () => {
    const { bridgeModuleRegistry } = await import('../../packages/cms/src/bridge/registry')
    const modules = bridgeModuleRegistry.map((module) => module.relativePath)

    expect(modules).toEqual([
      'convex/ginkoCms/assets.ts',
      'convex/ginkoCms/backup.ts',
      'convex/ginkoCms/collections.ts',
      'convex/ginkoCms/diagnostics.ts',
      'convex/ginkoCms/imports.ts',
      'convex/ginkoCms/editor.ts',
      'convex/ginkoCms/mcpKeys.ts',
      'convex/ginkoCms/members.ts',
      'convex/ginkoCms/migrations.ts',
      'convex/ginkoCms/public.ts',
      'convex/ginkoCms/revalidation.ts',
      'convex/ginkoCms/settings.ts',
      'convex/ginkoCms/siteData.ts',
      'convex/ginkoCmsMcp.ts',
    ])
    expect(bridgeModuleRegistry.every((module) => module.entries.length > 0)).toBe(true)
  })

  it('loads the bridge manifest through the public package export', async () => {
    const manifestModule = await importCmsManifestFromPackageExport()
    expect(manifestModule.default.packageName).toBe('@lupinum/ginko-cms')
  })

  it('renders only thin generated bridge stubs for function wrappers', async () => {
    const manifestModule = await importCmsManifestFromPackageExport()
    const files = await renderComponentBridgeFiles(manifestModule.default)
    const functionWrappers = files.filter(
      (file) =>
        file.relativePath === 'convex/ginkoCmsMcp.ts' ||
        (file.relativePath.startsWith('convex/ginkoCms/') &&
          file.relativePath !== 'convex/ginkoCms/_caller.ts'),
    )

    expect(functionWrappers.length).toBe(14)
    for (const file of functionWrappers) {
      expect(file.content, file.relativePath).toMatch(
        /import \{ create\w+Bridge \} from '@lupinum\/ginko-cms\/bridge'/,
      )
      expect(file.content, file.relativePath).toMatch(/export const \w+ = bridge\.\w+/)
      expect(file.content, file.relativePath).not.toMatch(
        /\bcomponent\.(?:query|mutation|action)\(/,
      )
      expect(file.content, file.relativePath).not.toMatch(
        /\bcomponent\.internal(?:Query|Mutation|Action)\(/,
      )
    }
  })

  it('keeps component refs private to generated bridge factory arguments', async () => {
    const manifestModule = await importCmsManifestFromPackageExport()
    const files = await renderComponentBridgeFiles(manifestModule.default)
    const functionWrappers = files.filter(
      (file) =>
        file.relativePath === 'convex/ginkoCmsMcp.ts' ||
        (file.relativePath.startsWith('convex/ginkoCms/') &&
          file.relativePath !== 'convex/ginkoCms/_caller.ts'),
    )

    for (const file of functionWrappers) {
      expect(file.content, file.relativePath).not.toMatch(
        /export\s+const\s+\w+\s*=\s*components\.ginkoCms\b/,
      )
      expect(file.content, file.relativePath).not.toMatch(/export\s+\{[^}]*components\b/)

      for (const line of file.content.split('\n').filter((line) => line.includes('components.'))) {
        expect(line.trim(), `${file.relativePath}: ${line}`).toMatch(
          /^(component|components): components\.ginkoCms\b/,
        )
      }
    }
  })

  it('keeps package-owned bridge factories aligned with component exports', async () => {
    const { bridgeModuleRegistry } = await import('../../packages/cms/src/bridge/registry')
    const references = collectFactoryReferences(
      bridgeModuleRegistry as readonly RuntimeBridgeRegistryModule[],
    )

    expect(references.length).toBeGreaterThan(100)
    expect(references).toContainEqual(
      expect.objectContaining({
        targetModule: 'public',
        targetExport: 'siteData',
      }),
    )
    expect(references).toContainEqual(
      expect.objectContaining({
        targetModule: 'members',
        targetExport: 'getAccessContext',
      }),
    )

    assertBridgeParity(references)
  })

  it('fails when a bridge factory targets a missing component export', () => {
    expect(() =>
      assertBridgeParity([
        {
          file: 'test/generated.ts',
          wrapperName: 'missing',
          bridgeKind: 'query',
          targetModule: 'public',
          targetExport: 'missingExport',
        },
      ]),
    ).toThrow(
      'test/generated.ts:missing targets missing component export components.ginkoCms.public.missingExport',
    )
  })
})
