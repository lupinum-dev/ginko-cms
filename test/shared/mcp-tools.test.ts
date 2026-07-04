import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const mcpRoot = join(process.cwd(), 'packages/cms/src/server/mcp')
const toolsRoot = join(mcpRoot, 'tools')
const directRoot = join(mcpRoot, 'direct')
const forbiddenTrellisMcpRuntime = ['define', 'Mcp', 'App'].join('')
const forbiddenGeneratedOpType = ['Operation', 'Handle'].join('')
const forbiddenGeneratedOpPath = ['operation', 'handles'].join('-')
const forbiddenMcpBridgeRef = ['internal', 'ginkoCmsMcp'].join('.')
const forbiddenGeneratedOperationsRef = ['operations', 'ginkoCms'].join('.')

type ToolReference = {
  path: string
  exportName: string | null
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) return tsFiles(path)
    return name.endsWith('.ts') ? [path] : []
  })
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text
  }
  return undefined
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (propertyName(property.name) === name) return property.initializer
  }
  return undefined
}

function objectPropertyString(
  object: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
  const value = objectProperty(object, name)
  return value && ts.isStringLiteral(value) ? value.text : undefined
}

function objectPropertyIsTrue(object: ts.ObjectLiteralExpression, name: string): boolean {
  const value = objectProperty(object, name)
  return value?.kind === ts.SyntaxKind.TrueKeyword
}

function objectPropertyObject(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralExpression | undefined {
  const value = objectProperty(object, name)
  return value && ts.isObjectLiteralExpression(value) ? value : undefined
}

function firstToolDefinition(path: string, exportName: string | null): ts.ObjectLiteralExpression {
  let result: ts.ObjectLiteralExpression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      const exported = node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
      for (const declaration of node.declarationList.declarations) {
        if (exportName && (!exported || !ts.isIdentifier(declaration.name))) continue
        if (exportName && declaration.name.text !== exportName) continue
        const initializer = declaration.initializer
        if (
          initializer &&
          ts.isCallExpression(initializer) &&
          ts.isIdentifier(initializer.expression) &&
          ['projectTool', 'defineMcpTool'].includes(initializer.expression.text)
        ) {
          const [arg] = initializer.arguments
          if (arg && ts.isObjectLiteralExpression(arg)) {
            result = arg
            return
          }
        }
      }
    }

    if (!exportName) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['projectTool', 'defineMcpTool'].includes(node.expression.text)
      ) {
        const [arg] = node.arguments
        if (arg && ts.isObjectLiteralExpression(arg)) {
          result = arg
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(path))
  if (!result) throw new Error(`No MCP tool definition found in ${path}.`)
  return result
}

function toolDefinitionName(reference: ToolReference): string {
  const definition = firstToolDefinition(reference.path, reference.exportName)
  const name =
    objectPropertyString(definition, 'name') ??
    objectPropertyString(objectPropertyObject(definition, 'meta') ?? definition, 'name')
  if (!name) throw new Error(`MCP tool definition in ${reference.path} has no explicit name.`)
  return name
}

function toolDefinitionIsDestructive(reference: ToolReference): boolean {
  const definition = firstToolDefinition(reference.path, reference.exportName)
  return (
    objectPropertyIsTrue(definition, 'destructive') ||
    objectPropertyIsTrue(objectPropertyObject(definition, 'meta') ?? definition, 'destructive')
  )
}

function toolDefinitionHasProperty(reference: ToolReference, name: string): boolean {
  return (
    objectProperty(firstToolDefinition(reference.path, reference.exportName), name) !== undefined
  )
}

function codeModeTools(): ToolReference[] {
  const toolsPath = join(mcpRoot, '_shared/handler-tools.ts')
  const sourceFile = parse(toolsPath)
  const imports = new Map<string, ToolReference>()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    if (!specifier.startsWith('../tools/') && !specifier.startsWith('../direct/')) continue
    const path = normalize(resolve(dirname(toolsPath), `${specifier}.ts`))
    const defaultImport = statement.importClause?.name?.text
    if (defaultImport) {
      imports.set(defaultImport, { path, exportName: null })
    }
    const namedBindings = statement.importClause?.namedBindings
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        imports.set(element.name.text, {
          path,
          exportName: (element.propertyName ?? element.name).text,
        })
      }
    }
  }

  let toolIdentifiers: string[] | undefined
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'mcpTools' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      toolIdentifiers = node.initializer.elements.map((element) => {
        if (!ts.isIdentifier(element)) {
          throw new Error('Expected shared MCP tools to be static identifier references.')
        }
        return element.text
      })
      return
    }
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === 'tools' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      toolIdentifiers = node.initializer.elements.map((element) => {
        if (!ts.isIdentifier(element)) {
          throw new Error('Expected code-mode tools to be static identifier references.')
        }
        return element.text
      })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  if (!toolIdentifiers) throw new Error('Expected code-mode MCP tools to be a static list.')

  return toolIdentifiers.map((identifier) => {
    const path = imports.get(identifier)
    if (!path) {
      throw new Error(`Code-mode tool "${identifier}" is not imported from tools/ or direct/.`)
    }
    return path
  })
}

function codeModeToolNames(): string[] {
  return codeModeTools().map(toolDefinitionName).sort()
}

describe('MCP tool safety contracts', () => {
  it('exposes the curated code-mode tool names, not file layout conventions', () => {
    expect(codeModeToolNames()).toEqual([
      'archive-entry',
      'create-entry',
      'delete-asset',
      'delete-entry',
      'explain-public-visibility',
      'export-backup',
      'get-asset',
      'get-collection',
      'get-entry',
      'list',
      'list-collections',
      'list-entries',
      'move-asset',
      'nav',
      'page',
      'publish-entry',
      'resolve-asset-urls',
      'save-entry-draft',
      'search',
      'sitemap',
      'unarchive-entry',
      'unpublish-entry',
    ])
  })

  it('does not expose outcome aliases or site-data/admin tools through MCP', () => {
    const exposedNames = codeModeToolNames()

    for (const forbidden of [
      'create-content-piece',
      'revise-content-piece',
      'prepare-publish',
      'publish-content-piece',
      'verify-public-content',
      'upload-and-place-media',
      'content-status',
      'repurpose-content',
      'resolve-relation-options',
      'list-colocated-assets',
      'move-asset-owner',
      'bulk-move-assets',
      'create-site-data-block',
      'save-site-data',
      'delete-site-data-block',
      'get-site-data-block',
      'list-site-data',
      'site-data',
      'mcp-doctor',
    ]) {
      expect(exposedNames).not.toContain(forbidden)
    }
  })

  it('keeps direct MCP helpers in one explicit folder outside the tool tree', () => {
    const nestedDirectTools = tsFiles(toolsRoot).filter((path) => path.endsWith('/direct.ts'))

    expect(nestedDirectTools).toEqual([])
    expect(
      tsFiles(directRoot)
        .map((path) => normalize(path).replace(normalize(`${directRoot}/`), ''))
        .sort(),
    ).toEqual(['assets.ts', 'content.ts', 'public.ts'])
  })

  it('registers MCP handlers through the discovery directory, not dead file globs', () => {
    const moduleSource = readFileSync(join(process.cwd(), 'packages/cms/src/module.ts'), 'utf8')

    expect(moduleSource).toContain('handlers.push(mcpDiscoveryRoot)')
    expect(moduleSource).not.toContain('handler-configs')
    expect(moduleSource).not.toContain("resolve(mcpDiscoveryRoot, 'index.js')")
    expect(moduleSource).not.toContain("resolve(mcpDiscoveryRoot, 'code-mode.js')")
  })

  it('keeps non-handler support files out of the toolkit handler scan root', () => {
    const topLevelTsFiles = readdirSync(mcpRoot)
      .filter((name) => name.endsWith('.ts'))
      .sort()

    expect(topLevelTsFiles).toEqual(['index.ts'])
  })

  it('exposes the curated tool set through toolkit-native default and code-mode handlers', () => {
    const defaultHandler = readFileSync(join(mcpRoot, 'index.ts'), 'utf8')
    const codeHandler = readFileSync(join(mcpRoot, 'handlers/code/index.ts'), 'utf8')

    expect(defaultHandler).toContain("route: '/mcp'")
    expect(defaultHandler).toContain('tools: mcpTools')
    expect(codeHandler).toContain("route: '/mcp/code'")
    expect(codeHandler).toContain('tools: mcpTools')
  })

  it('documents the host dependency required by the enabled code-mode handler', () => {
    const codeHandler = readFileSync(join(mcpRoot, 'handlers/code/index.ts'), 'utf8')
    const mcpDoctor = readFileSync(
      join(process.cwd(), 'packages/cms/src/cli/mcp-doctor.ts'),
      'utf8',
    )

    expect(codeHandler).toContain('experimental_codeMode: true')
    expect(mcpDoctor).toContain('secure-exec host dependency')
    expect(mcpDoctor).toContain('Nuxt MCP code mode resolves it from the host app root')
  })

  it('keeps destructive tools behind CMS operation previews', () => {
    const destructiveTools = codeModeTools().filter(toolDefinitionIsDestructive)

    expect(destructiveTools.map(toolDefinitionName).sort()).toEqual([
      'archive-entry',
      'delete-asset',
      'delete-entry',
      'publish-entry',
      'unpublish-entry',
    ])

    for (const reference of destructiveTools) {
      expect(toolDefinitionHasProperty(reference, 'operation'), reference.path).toBe(true)
      expect(toolDefinitionHasProperty(reference, 'preview'), reference.path).toBe(false)
      expect(toolDefinitionHasProperty(reference, 'previewOperation'), reference.path).toBe(false)
    }
  })

  it('routes destructive MCP tools through explicit backend preview and execute refs', () => {
    const runtime = readFileSync(join(mcpRoot, '_shared/project-tool-runtime.ts'), 'utf8')
    const destructiveTools = [
      join(toolsRoot, 'assets/delete-asset.ts'),
      join(toolsRoot, 'content/delete-entry.ts'),
      join(toolsRoot, 'content/archive-entry.ts'),
      join(toolsRoot, 'content/publish-entry.ts'),
      join(toolsRoot, 'content/unpublish-entry.ts'),
    ].map((path) => readFileSync(path, 'utf8'))

    expect(runtime).toContain('components.ginkoCms.members.getAccessContext')
    expect(runtime).toContain('cmsMcpConvexAuthIssuer')
    expect(runtime).toContain('subject: mcpKeyId')
    expect(runtime).toContain('createMcpConvexCaller(event, caller.mcpKeyId)')
    expect(runtime).toContain('CMS operation preview requires confirmation before execution.')
    expect(runtime).toContain('_confirmationToken')
    expect(runtime).toContain('createMcpConvexCaller')
    expect(runtime).not.toContain(forbiddenTrellisMcpRuntime)
    expect(runtime).not.toContain('rawMcpRuntime')
    expect(runtime).not.toContain(forbiddenGeneratedOpType)
    expect(runtime).not.toContain(forbiddenGeneratedOpPath)
    expect(runtime).not.toContain(forbiddenMcpBridgeRef)

    for (const source of destructiveTools) {
      expect(source).toContain('components.ginkoCms.')
      expect(source).toMatch(/execute: components\.ginkoCms\.\w+\.\w+OperationExecute/)
      expect(source).toMatch(/preview: components\.ginkoCms\.\w+\.preview\w+Operation/)
      expect(source).not.toContain(forbiddenGeneratedOpPath)
      expect(source).not.toContain(forbiddenGeneratedOperationsRef)
      expect(source).not.toContain(forbiddenMcpBridgeRef)
      expect(source).not.toContain('defineOperationMetadata')
      expect(source).not.toContain('defineOperation({')
      expect(source).not.toContain('handler: () => null')
    }
  })

  it('keeps MCP writes operation-backed instead of direct mutation calls', () => {
    const runtime = readFileSync(join(mcpRoot, '_shared/project-tool-runtime.ts'), 'utf8')
    const directSources = tsFiles(directRoot)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(runtime).not.toContain('stampMcpToolSafety')
    expect(runtime).not.toContain('TrellisMcpToolSafety')
    expect(runtime).not.toContain('rawMcpRuntime.tool.mutation')
    expect(runtime).toContain('must be backed by an explicit operation')
    expect(runtime).toContain('Direct MCP mutation')
    expect(directSources).not.toContain('safety:')
    expect(directSources).not.toContain(forbiddenGeneratedOpPath)
    expect(directSources).not.toContain('operationRefs')

    for (const operationRef of [
      'execute: components.ginkoCms.editor.createEntry',
      'execute: components.ginkoCms.editor.saveEntryDraft',
      'execute: components.ginkoCms.editor.unarchiveEntry',
      'execute: components.ginkoCms.assets.moveAsset',
    ]) {
      expect(directSources).toContain(operationRef)
    }

    for (const oldOperationName of [
      'createEntryOperation',
      'saveEntryDraftOperation',
      'unarchiveEntryOperation',
      'moveAssetOperation',
    ]) {
      expect(directSources).not.toContain(oldOperationName)
    }

    for (const oldCallRef of [
      'call: components.ginkoCms.editor.createEntry',
      'call: components.ginkoCms.editor.saveEntryDraft',
      'call: components.ginkoCms.editor.unarchiveEntry',
      'call: components.ginkoCms.assets.moveAsset',
      forbiddenMcpBridgeRef,
    ]) {
      expect(directSources).not.toContain(oldCallRef)
    }
  })

  it('keeps MCP from uploading or fetching new assets', () => {
    const toolSources = tsFiles(toolsRoot)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(toolSources).not.toContain("name: 'upload-asset'")
    expect(toolSources).not.toContain('readUploadSource')
    expect(toolSources).not.toContain('generateUploadUrl')
    expect(toolSources).not.toContain('registerAsset')
    expect(toolSources).not.toContain('remoteUrl')
    expect(toolSources).not.toContain('localPath')
  })

  it('keeps workflow prompts on canonical tools', () => {
    const promptsAndResources = [
      'prompts/agent/create-polished-content.ts',
      'prompts/agent/publish-readiness.ts',
      'prompts/public/prepare-publish.ts',
      'prompts/public/review-seo.ts',
      'prompts/public/translate-page.ts',
      'resources/agent/authoring-guide.ts',
      'resources/agent/publish-safety-guide.ts',
      'resources/agent/rich-media-guide.ts',
      'resources/public/capabilities-guide.ts',
      'resources/public/diagnostics-guide.ts',
    ]
      .map((path) => readFileSync(join(mcpRoot, path), 'utf8'))
      .join('\n')

    expect(promptsAndResources).toContain('create-entry')
    expect(promptsAndResources).toContain('save-entry-draft')
    expect(promptsAndResources).not.toContain('upload-asset')
    expect(promptsAndResources).not.toContain('list-assets')
    expect(promptsAndResources).toContain('resolve-asset-urls')
    expect(promptsAndResources).toContain('publish-entry')
    expect(promptsAndResources).toContain('page')
    expect(promptsAndResources).toContain('sitemap')

    for (const forbidden of [
      'create-content-piece',
      'revise-content-piece',
      'publish-content-piece',
      'upload-and-place-media',
      'verify-public-content',
      'preview-publish-impact',
      'validate-public-routes',
    ]) {
      expect(promptsAndResources).not.toContain(forbidden)
    }
  })

  it('keeps Studio workflow surfaces visible in the entry and collection screens', () => {
    const entryPage = readFileSync(
      join(process.cwd(), 'packages/cms/studio-app/src/pages/[collection]/[id].vue'),
      'utf8',
    )
    const publicWorkflowPanel = readFileSync(
      join(
        process.cwd(),
        'packages/cms/studio-app/src/components/studio/editor/StudioEntryPublicWorkflowPanel.vue',
      ),
      'utf8',
    )
    const translationReadinessPanel = readFileSync(
      join(
        process.cwd(),
        'packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue',
      ),
      'utf8',
    )
    const collectionContract = readFileSync(
      join(
        process.cwd(),
        'packages/cms/studio-app/src/components/studio/collections/StudioCollectionContractSection.vue',
      ),
      'utf8',
    )

    expect(entryPage).toContain('StudioEntryPublicWorkflowPanel')
    expect(entryPage).toContain('StudioEntryTranslationReadinessPanel')
    expect(publicWorkflowPanel).toContain('Public output')
    expect(publicWorkflowPanel).toContain('What will change?')
    expect(translationReadinessPanel).toContain('Translation readiness')
    expect(translationReadinessPanel).toContain('Review translation readiness')
    expect(collectionContract).toContain('Collection capability')
    expect(collectionContract).toContain('Route-backed')
    expect(collectionContract).toContain('Data-only')
  })
})
