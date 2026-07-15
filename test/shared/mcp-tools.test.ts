import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const mcpRoot = join(process.cwd(), 'packages/cms/src/server/mcp')
const toolsRoot = join(mcpRoot, 'tools')
const directRoot = join(mcpRoot, 'direct')
const forbiddenGeneratedOpPath = ['operation', 'handles'].join('-')
const forbiddenMcpBridgeRef = ['internal', ['ginkoCms', 'Mcp'].join('')].join('.')

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
      'complete-agent-run',
      'create-entry',
      'explain-public-visibility',
      'get-asset',
      'get-collection',
      'get-entry',
      'get-readiness-detail',
      'get-review-status',
      'list',
      'list-agent-runs',
      'list-collections',
      'list-entries',
      'nav',
      'page',
      'preview-publish',
      'request-publish-review',
      'resolve-asset-urls',
      'save-entry-draft',
      'search',
      'sitemap',
      'start-agent-run',
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
    ).toEqual(['agent-runs.ts', 'assets.ts', 'content.ts', 'public.ts'])
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

  it('keeps public-output writes review gated and removes unrelated MCP authority', () => {
    const sensitiveTools = ['preview-publish', 'request-publish-review']

    expect(
      codeModeToolNames()
        .filter((name) => sensitiveTools.includes(name))
        .sort(),
    ).toEqual(sensitiveTools)

    for (const forbidden of [
      'publish-entry',
      'archive-entry',
      'restore-entry',
      'move-asset',
      'export-backup',
    ]) {
      expect(codeModeToolNames()).not.toContain(forbidden)
    }

    expect(existsSync(join(toolsRoot, 'content/publish-entry.ts'))).toBe(false)
    expect(existsSync(join(toolsRoot, 'content/archive-entry.ts'))).toBe(false)
  })

  it('keeps active MCP tools explicit and removes the generic projectTool runtime', () => {
    const allToolSources = tsFiles(mcpRoot)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')
    const directSources = tsFiles(directRoot)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(existsSync(join(mcpRoot, '_shared/project-tool-runtime.ts'))).toBe(false)
    expect(allToolSources).not.toContain('projectTool')
    expect(allToolSources).not.toContain('ProjectToolDefinition')
    expect(allToolSources).not.toContain('stampMcpToolSafety')
    expect(allToolSources).not.toContain('TrellisMcpToolSafety')
    expect(allToolSources).not.toContain('rawMcpRuntime')
    expect(directSources).not.toContain('safety:')
    expect(directSources).not.toContain(forbiddenGeneratedOpPath)
    expect(directSources).not.toContain(['operation', 'Refs'].join(''))

    for (const explicitToolName of ["name: 'create-entry'", "name: 'save-entry-draft'"]) {
      expect(directSources).toContain(explicitToolName)
    }
    expect(directSources).toContain("name: 'start-agent-run'")
    expect(allToolSources).toContain("name: 'get-review-status'")

    for (const oldOperationName of [
      'createEntryOperation',
      'saveEntryDraftOperation',
      'moveAssetOperation',
    ]) {
      expect(directSources).not.toContain(oldOperationName)
    }

    for (const oldCallRef of [
      'call: components.ginkoCms.editor.createEntry',
      'call: components.ginkoCms.editor.saveEntryDraft',
      'call: components.ginkoCms.assets.moveAsset',
      forbiddenMcpBridgeRef,
    ]) {
      expect(directSources).not.toContain(oldCallRef)
    }
  })

  it('requires active agent runs and caller-bound request ids for content writes', () => {
    const writeToolSources = [
      join(directRoot, 'content.ts'),
      join(toolsRoot, 'content/preview-publish.ts'),
      join(toolsRoot, 'content/request-publish-review.ts'),
    ].map((path) => readFileSync(path, 'utf8'))

    for (const source of writeToolSources) {
      for (const toolName of [
        'create-entry',
        'save-entry-draft',
        'preview-publish',
        'request-publish-review',
      ]) {
        if (!source.includes(`name: '${toolName}'`)) continue
        expect(source).toContain('agentRunId: z.string()')
        expect(source).not.toContain('recordAgentWrite(context,')
      }
    }

    const combinedSource = writeToolSources.join('\n')
    expect(combinedSource).toMatch(/requestId:\s*z\s*\.string\(\)/)
    expect(combinedSource).toContain('api.ginkoCms.editor.mcpCreateEntry')
    expect(combinedSource).toContain('api.ginkoCms.editor.mcpSaveEntryDraft')
    expect(combinedSource).toContain('api.ginkoCms.editor.mcpPreviewPublishEntry')
    expect(combinedSource).not.toContain('api.ginkoCms.editor.mcpPublishEntry')
    expect(combinedSource).not.toContain('api.ginkoCms.editor.mcpArchiveEntry')
    expect(combinedSource).not.toContain('mcpRecordPublishEntry')
    expect(combinedSource).not.toContain('mcpRecordArchiveEntry')
    expect(combinedSource).toContain('api.ginkoCms.reviewRequests.requestPublishReview')
  })

  it('requires an explicit capability and never accepts authority overrides', () => {
    const sources = codeModeTools().map(({ path }) => readFileSync(path, 'utf8'))
    for (const source of sources) {
      expect(source).not.toContain('loadAgentContext(ctx.event)')
    }
    const combined = sources.join('\n')
    for (const authorityInput of [
      'authUserId:',
      'memberId:',
      'ownerUserId:',
      'role:',
      'tokenHash:',
      'apiKeyId:',
      'capability:',
    ]) {
      expect(combined).not.toContain(authorityInput)
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
    expect(promptsAndResources).toContain('preview-publish')
    expect(promptsAndResources).toContain('request-publish-review')
    expect(promptsAndResources).toContain('get-review-status')
    expect(promptsAndResources).toContain('page')
    expect(promptsAndResources).toContain('sitemap')
    expect(promptsAndResources).not.toContain('_confirmationToken')
    expect(promptsAndResources).not.toContain('publish-entry')
    expect(promptsAndResources).not.toContain('archive-entry')

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
    // RFC Phase 5: the workflow surfaces moved out of the entry page's main column
    // into the right-sidebar details panel, which the entry page registers. The
    // "stays visible in the entry screen" contract now holds through that panel.
    const entryDetailsPanel = readFileSync(
      join(
        process.cwd(),
        'packages/cms/studio-app/src/components/studio/editor/StudioEntryDetailsPanel.vue',
      ),
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

    expect(entryPage).toContain('StudioEntryDetailsPanel')
    expect(entryDetailsPanel).toContain('StudioEntryPublicWorkflowPanel')
    expect(entryDetailsPanel).toContain('StudioEntryTranslationReadinessPanel')
    // The literal moved into the locale packs (design review F1b); the panel
    // references it by key.
    expect(publicWorkflowPanel).toContain('publicWorkflowLiveContent')
    expect(publicWorkflowPanel).toContain('publicWorkflowWhatWillChange')
    expect(translationReadinessPanel).toContain('translationReadinessLanguageStatus')
    expect(translationReadinessPanel).toContain('translationReadinessReviewLanguage')
    // The collection-contract copy moved into the locale packs (i18n completion
    // sweep, W6); the section references it by key.
    expect(collectionContract).toContain('collectionContract.websiteUse')
    expect(collectionContract).toContain('collectionContract.createsWebsitePages')
    expect(collectionContract).toContain('collectionContract.sharedContent')
  })
})
