import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import * as ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../..')
const trellisPackageName = ['@lupinum', 'trellis'].join('/')
const trellisBridgePackageName = ['@lupinum', 'trellis-bridge'].join('/')
const requiredPackageOutputs = [
  'packages/contract/dist/validators.js',
  'packages/contract/dist/convex/caller.js',
  'packages/contract/dist/fields/index.js',
  'packages/convex/dist/component/convex.config.js',
  'packages/convex/dist/convex.auth.js',
  'packages/convex/dist/componentBridge.js',
  'packages/convex/dist/_generated/component.js',
  'packages/cms/dist/module.mjs',
  'packages/cms/dist/types.d.mts',
  'packages/cms/dist/bridge/create.js',
  'packages/cms/dist/bridge/public.js',
  'packages/cms/dist/bridge/members.js',
  'packages/cms/convex/manifest.js',
  'packages/cms/convex/manifest.d.ts',
]

type PackageJson = {
  name: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  exports?: Record<string, unknown>
  files?: string[]
  peerDependencies?: Record<string, string>
}

function readPackageJson(relativePath: string): PackageJson {
  return JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf-8'))
}

function ensurePackageOutputs() {
  if (requiredPackageOutputs.every((output) => existsSync(resolve(projectRoot, output)))) return

  execFileSync('pnpm', ['--filter', '@lupinum/ginko-cms', 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
  })
}

function collectSourceFiles(root: string): string[] {
  const absoluteRoot = resolve(projectRoot, root)
  const files: string[] = []

  function visit(directory: string) {
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '_generated') continue

      const absolute = resolve(directory, entry)
      const stats = statSync(absolute)
      if (stats.isDirectory()) {
        visit(absolute)
        continue
      }

      if (/\.(?:ts|tsx|vue|js|mjs)$/.test(entry)) {
        files.push(absolute)
      }
    }
  }

  visit(absoluteRoot)
  return files
}

function collectFiles(root: string): string[] {
  const absoluteRoot = resolve(projectRoot, root)
  const files: string[] = []

  function visit(directory: string) {
    for (const entry of readdirSync(directory)) {
      const absolute = resolve(directory, entry)
      const stats = statSync(absolute)
      if (stats.isDirectory()) {
        visit(absolute)
        continue
      }
      files.push(relative(absoluteRoot, absolute))
    }
  }

  visit(absoluteRoot)
  return files.sort((left, right) => left.localeCompare(right))
}

function readImportSpecifiers(
  files: string[],
): Array<{ file: string; specifier: string; typeOnly: boolean }> {
  const specifiers: Array<{ file: string; specifier: string; typeOnly: boolean }> = []

  for (const file of files) {
    const source = readFileSync(file, 'utf-8')
    const sourceFragments = file.endsWith('.vue') ? extractVueScriptBlocks(source) : [source]
    for (const fragment of sourceFragments) {
      for (const { specifier, typeOnly } of readImportSpecifiersFromSource(fragment)) {
        specifiers.push({
          file: relative(projectRoot, file),
          specifier,
          typeOnly,
        })
      }
    }
  }

  return specifiers
}

function readNamedImportsFromSource(
  source: string,
  specifier: string,
): Array<{ imported: string; typeOnly: boolean }> {
  const imports: Array<{ imported: string; typeOnly: boolean }> = []
  const sourceFile = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)

  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      node.moduleSpecifier.text === specifier
    ) {
      const importClause = node.importClause
      const namedBindings = importClause?.namedBindings
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          imports.push({
            imported: (element.propertyName ?? element.name).text,
            typeOnly: importClause.isTypeOnly || element.isTypeOnly,
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return imports
}

function readNamedImports(
  files: string[],
  specifier: string,
): Array<{ file: string; imported: string; typeOnly: boolean }> {
  const imports: Array<{ file: string; imported: string; typeOnly: boolean }> = []

  for (const file of files) {
    const source = readFileSync(file, 'utf-8')
    const sourceFragments = file.endsWith('.vue') ? extractVueScriptBlocks(source) : [source]
    for (const fragment of sourceFragments) {
      for (const namedImport of readNamedImportsFromSource(fragment, specifier)) {
        imports.push({
          file: relative(projectRoot, file),
          ...namedImport,
        })
      }
    }
  }

  return imports
}

function extractVueScriptBlocks(source: string): string[] {
  const blocks = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  )
  return blocks.length > 0 ? blocks : [source]
}

function readImportSpecifiersFromSource(
  source: string,
): Array<{ specifier: string; typeOnly: boolean }> {
  const specifiers: Array<{ specifier: string; typeOnly: boolean }> = []
  const sourceFile = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)

  function readStringLiteral(node: ts.Expression): string | null {
    return ts.isStringLiteralLike(node) ? node.text : null
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const specifier = readStringLiteral(node.moduleSpecifier)
      if (specifier)
        specifiers.push({ specifier, typeOnly: node.importClause?.isTypeOnly === true })
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = readStringLiteral(node.moduleSpecifier)
      if (specifier) specifiers.push({ specifier, typeOnly: node.isTypeOnly })
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const specifier = readStringLiteral(node.arguments[0])
      if (specifier) specifiers.push({ specifier, typeOnly: false })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

function expectNoForbiddenImports(label: string, root: string, forbidden: Array<string | RegExp>) {
  const imports = readImportSpecifiers(collectSourceFiles(root))
  const violations = imports.filter(({ specifier }) =>
    forbidden.some((rule) =>
      typeof rule === 'string' ? specifier === rule : rule.test(specifier),
    ),
  )

  expect(
    violations.map(({ file, specifier }) => `${file} -> ${specifier}`),
    `${label} has forbidden imports`,
  ).toEqual([])
}

const contractPackage = readPackageJson('packages/contract/package.json')
const convexPackage = readPackageJson('packages/convex/package.json')
const cmsPackage = readPackageJson('packages/cms/package.json')

describe('package boundary contracts', () => {
  beforeAll(() => {
    ensurePackageOutputs()
  }, 120_000)

  it('keeps public export keys intentional and minimal', () => {
    expect(Object.keys(contractPackage.exports ?? {}).sort()).toEqual([
      './convex/caller.js',
      './convex/schemas/*.js',
      './convex/validators.js',
      './shared/assetPolicy.js',
      './shared/caller.js',
      './shared/contentTags.js',
      './shared/fields',
      './shared/fields/*.js',
      './shared/order.js',
      './shared/permissions.js',
      './shared/publicContent.js',
      './shared/routeDiagnostics.js',
      './shared/types.js',
      './shared/utils.js',
    ])

    expect(Object.keys(convexPackage.exports ?? {}).sort()).toEqual([
      './_generated/component.js',
      './component',
      './component-bridge',
      './convex.auth',
      './convex.config',
      './operation-handles/mcp',
      './operations',
    ])

    expect(Object.keys(cmsPackage.exports ?? {}).sort()).toEqual([
      '.',
      './bridge',
      './config',
      './convex/auth',
      './convex/auth-config',
      './convex/manifest',
      './migration',
      './nuxt-provider',
      './public',
    ])
  })

  it('keeps contract source free of Nuxt, Vue, Studio, and Convex component imports', () => {
    expectNoForbiddenImports('contract', 'packages/contract/src', [
      'vue',
      'nuxt',
      '@nuxt/kit',
      '@nuxt/schema',
      '@lupinum/ginko-cms',
      '@lupinum/ginko-cms-convex',
      /^#(?:runtime|component|imports|app|trellis)(?:\/|$)/,
      /(?:^|\/)packages\/cms(?:\/|$)/,
      /(?:^|\/)packages\/convex(?:\/|$)/,
      /(?:^|\/)_generated(?:\/|$)/,
    ])
  })

  it('keeps shared contract exports free of Convex runtime imports', () => {
    const sharedFiles = [
      'packages/contract/src/publicContent.ts',
      'packages/contract/src/types.ts',
      'packages/contract/src/order.ts',
      'packages/contract/src/permissions.ts',
      'packages/contract/src/caller.ts',
      'packages/contract/src/routeDiagnostics.ts',
      'packages/contract/src/utils.ts',
      ...collectSourceFiles('packages/contract/src/fields'),
    ].map((file) => resolve(projectRoot, file))
    const imports = readImportSpecifiers(sharedFiles)
    const violations = imports.filter(
      ({ specifier }) => specifier === 'convex' || specifier.startsWith('convex/'),
    )

    expect(
      violations.map(({ file, specifier }) => `${file} -> ${specifier}`),
      'shared contract exports must stay Convex-free',
    ).toEqual([])
  })

  it('keeps Convex component source free of Nuxt, Vue, TipTap, Reka, and module-builder imports', () => {
    expectNoForbiddenImports('convex', 'packages/convex/src', [
      'vue',
      'nuxt',
      '@nuxt/kit',
      '@nuxt/schema',
      '@nuxt/module-builder',
      '@tiptap/core',
      '@tiptap/vue-3',
      'reka-ui',
      '@lupinum/ginko-cms',
      /^#(?:runtime|imports|app|trellis)(?:\/|$)/,
      /(?:^|\/)packages\/cms(?:\/|$)/,
    ])
  })

  it('keeps package-owned bridge factories Convex-safe', () => {
    expectNoForbiddenImports('cms bridge factories', 'packages/cms/src/bridge', [
      'vue',
      'nuxt',
      '@nuxt/kit',
      '@nuxt/schema',
      '@lupinum/trellis/bridge',
      /^#(?:runtime|imports|app|trellis)(?:\/|$)/,
      /(?:^|\/)studio-app(?:\/|$)/,
    ])
  })

  it('uses the Trellis bridge package for release-facing bridge APIs', () => {
    const files = [
      ...collectSourceFiles('packages/cms/src'),
      ...collectSourceFiles('packages/cms/convex'),
      ...collectSourceFiles('packages/convex/src'),
    ]
    const imports = readImportSpecifiers(files)
    const oldBridgeImports = imports.filter(
      ({ specifier }) => specifier === '@lupinum/trellis/bridge',
    )

    expect(
      oldBridgeImports.map(({ file, specifier }) => `${file} -> ${specifier}`),
      'bridge APIs must come from @lupinum/trellis-bridge',
    ).toEqual([])

    const bridgeApiNames = new Set([
      'callComponentBridgeRegistrar',
      'createComponentBridge',
      'defineComponentBridgeManifest',
      'ComponentBridgeComponent',
      'ComponentBridgeManifest',
      'ComponentBridgeModule',
      'renderComponentBridgeFile',
      'renderComponentBridgeFiles',
      'renderComponentBridgeManagedEdits',
    ])
    const bridgeApisFromFunctions = readNamedImports(files, '@lupinum/trellis/functions').filter(
      ({ imported }) => bridgeApiNames.has(imported),
    )

    expect(
      bridgeApisFromFunctions.map(({ file, imported }) => `${file} -> ${imported}`),
      'bridge APIs must not be imported from @lupinum/trellis/functions',
    ).toEqual([])
  })

  it('detects forbidden multiline import specifiers', () => {
    expect(readImportSpecifiersFromSource("import {\n  ref\n} from 'vue'\n")).toEqual([
      { specifier: 'vue', typeOnly: false },
    ])
  })

  it('keeps Nuxt magic imports out of standalone Studio source', () => {
    const imports = readImportSpecifiers(collectSourceFiles('packages/cms/studio-app/src'))
    const violations = imports.filter(({ specifier }) =>
      ['#imports', '#app', '#app/nuxt'].includes(specifier),
    )

    expect(
      violations.map(({ file, specifier }) => `${file} -> ${specifier}`),
      'Studio source must use explicit SPA adapters instead of Nuxt magic imports',
    ).toEqual([])
  })

  it('keeps Nuxt-oriented runtime composables out of standalone Studio source', () => {
    const imports = readImportSpecifiers(collectSourceFiles('packages/cms/studio-app/src'))
    const runtimeViolations = imports.filter(
      ({ specifier, typeOnly }) =>
        !typeOnly &&
        (specifier === '@lupinum/trellis/composables' ||
          specifier === 'better-convex-nuxt/composables'),
    )

    expect(
      runtimeViolations.map(({ file, specifier }) => `${file} -> ${specifier}`),
      'Studio runtime must use its host-bridge Convex boundary instead of Nuxt composables',
    ).toEqual([])
  })

  it('keeps Nuxt auth runtime components independent from Studio source files', () => {
    const imports = readImportSpecifiers(collectSourceFiles('packages/cms/src/auth'))
    const violations = imports.filter(({ specifier }) => specifier.includes('studio-app/src'))

    expect(
      violations.map(({ file, specifier }) => `${file} -> ${specifier}`),
      'Auth runtime components must own their small UI primitives instead of importing Studio SPA internals',
    ).toEqual([])
  })

  it('keeps package dependency graphs pointed in one direction', () => {
    expect(contractPackage.dependencies?.['@lupinum/ginko-cms']).toBeUndefined()
    expect(contractPackage.dependencies?.['@lupinum/ginko-cms-convex']).toBeUndefined()
    expect(contractPackage.dependencies?.convex).toBeUndefined()
    expect(contractPackage.peerDependencies?.convex).toBe('^1.38.0')

    const convexDeps = {
      ...convexPackage.dependencies,
      ...convexPackage.peerDependencies,
      ...convexPackage.devDependencies,
    }
    for (const forbidden of [
      'nuxt',
      '@nuxt/kit',
      '@nuxt/module-builder',
      'vue',
      '@tiptap/vue-3',
      'reka-ui',
    ]) {
      expect(
        convexDeps[forbidden],
        `${forbidden} must not be a Convex package dependency`,
      ).toBeUndefined()
    }
    expect(convexPackage.dependencies?.['@lupinum/ginko-cms-contract']).toBe('workspace:^')
    expect(convexPackage.dependencies?.[trellisPackageName]).toBeUndefined()
    expect(convexPackage.dependencies?.[trellisBridgePackageName]).toBeUndefined()

    expect(cmsPackage.dependencies?.['@lupinum/ginko-cms-contract']).toBe('workspace:^')
    expect(cmsPackage.dependencies?.['@lupinum/ginko-cms-convex']).toBe('workspace:^')
    expect(cmsPackage.dependencies?.[trellisPackageName]).toBeUndefined()
    expect(cmsPackage.dependencies?.[trellisBridgePackageName]).toBeUndefined()
    expect(cmsPackage.dependencies?.['better-convex-nuxt']).toBeDefined()
  })

  it('does not reintroduce Nuxt-package Convex host artifacts', () => {
    const forbiddenPaths = [
      'packages/cms/convex/auth.ts',
      'packages/cms/convex/auth.config.ts',
      'packages/cms/convex/convex.config.ts',
      'packages/cms/convex/http.ts',
      'packages/cms/convex/ginkoCms',
      'packages/cms/convex/ginkoCmsMcp.ts',
      'packages/cms/dist/package',
    ]

    for (const path of forbiddenPaths) {
      expect(existsSync(resolve(projectRoot, path)), `${path} must not exist`).toBe(false)
    }

    expect(cmsPackage.files).toEqual([
      'compatibility.json',
      'convex/manifest.d.ts',
      'convex/manifest.js',
      'dist',
      'LICENSE',
      'README.md',
      'templates',
    ])
  })

  it('materializes every declared package-facing output before publish validation', () => {
    for (const output of requiredPackageOutputs) {
      expect(existsSync(resolve(projectRoot, output)), `${output} must exist`).toBe(true)
    }
  })

  it('ships a bounded Convex component entrypoint surface', () => {
    const componentJsFiles = collectFiles('packages/convex/dist/component').filter((file) =>
      file.endsWith('.js'),
    )

    expect(componentJsFiles).toEqual([
      'assets.js',
      'auth/appIdentity.js',
      'backup.js',
      'collections.js',
      'collections/contracts.js',
      'collections/import.js',
      'collections/jobs.js',
      'collections/sync.js',
      'convex.config.js',
      'crons.js',
      'diagnostics.js',
      'editor.js',
      'entries/draft.js',
      'entries/publish.js',
      'entries/read.js',
      'entries/tree.js',
      'imports.js',
      'mcpKeys.js',
      'members.js',
      'migrations.js',
      'operations.js',
      'public.js',
      'revalidation.js',
      'schema.js',
      'settings.js',
      'siteData.js',
      'storageMaintenance.js',
    ])
    expect(convexPackage.exports?.['./convex.config']).toEqual({
      types: './dist/component/convex.config.d.ts',
      import: './dist/component/convex.config.js',
    })
  })

  it('keeps generated and authored bridge forwarding on signed envelopes only', () => {
    const files = [
      resolve(projectRoot, 'packages/convex/src/_generated/component.ts'),
      ...collectSourceFiles('packages/convex/src'),
      ...collectSourceFiles('packages/cms/src/bridge'),
      resolve(projectRoot, 'test/helpers.ts'),
    ]

    const rawForwardingUses = files.flatMap((file) => {
      const source = readFileSync(file, 'utf-8')
      const matches = source.match(/\b_identityForwarding(?:Key)?\b/g) ?? []
      return matches.map((match) => `${relative(projectRoot, file)} -> ${match}`)
    })

    expect(rawForwardingUses).toEqual([])
    expect(
      readFileSync(resolve(projectRoot, 'packages/convex/src/_generated/component.ts'), 'utf-8'),
    ).toContain('_trellisForwarding?: string')
  })

  it('loads representative built package outputs', async () => {
    const [
      contractValidators,
      contractCmsCaller,
      contractFields,
      convexConfig,
      convexAuth,
      convexComponentBridge,
      cmsModule,
      cmsManifest,
    ] = await Promise.all([
      import('../../packages/contract/dist/validators.js'),
      import('../../packages/contract/dist/convex/caller.js'),
      import('../../packages/contract/dist/fields/index.js'),
      import('../../packages/convex/dist/component/convex.config.js'),
      import('../../packages/convex/dist/convex.auth.js'),
      import('../../packages/convex/dist/componentBridge.js'),
      import('../../packages/cms/dist/module.mjs'),
      import('../../packages/cms/convex/manifest.js'),
    ])

    expect(contractValidators.fieldValidator).toBeDefined()
    expect(contractCmsCaller.cmsCallerValidator).toBeDefined()
    expect(contractFields.normalizeFields).toBeTypeOf('function')
    expect(convexConfig.default).toBeDefined()
    expect(convexAuth.defineGinkoAuth).toBeTypeOf('function')
    expect(convexComponentBridge.createCmsComponentBridge).toBeTypeOf('function')
    expect(cmsModule.default).toBeTypeOf('function')
    expect(cmsManifest.default.packageName).toBe('@lupinum/ginko-cms')
  })

  it('uses package-style imports in generated bridge templates', () => {
    const templateFiles = collectSourceFiles('packages/cms/templates')
    const imports = readImportSpecifiers(templateFiles)
    const nonPackageImports = imports.filter(
      ({ specifier }) =>
        !specifier.startsWith('@lupinum/ginko-cms/') &&
        !specifier.startsWith('@lupinum/ginko-cms-convex/') &&
        !specifier.startsWith('convex/') &&
        !specifier.startsWith('./') &&
        !specifier.startsWith('../'),
    )

    expect(
      nonPackageImports.map(({ file, specifier }) => `${file} -> ${specifier}`),
      'generated host templates should import stable package surfaces only',
    ).toEqual([])
  })

  it('does not read legacy Trellis auth internals', () => {
    const files = [
      ...collectSourceFiles('packages/cms/src'),
      ...collectSourceFiles('packages/cms/studio-app/src'),
    ]
    const trellisAuthReads = files
      .filter((file) => readFileSync(file, 'utf-8').includes('__trellis_auth_engine__'))
      .map((file) => relative(projectRoot, file))

    expect(trellisAuthReads).toEqual([])
  })

  it('keeps Studio global host bridge reads inside boundary modules', () => {
    const allowedFiles = [
      'packages/cms/studio-app/src/boundary/api.ts',
      'packages/cms/studio-app/src/boundary/host-bridge.ts',
      'packages/cms/src/runtime/pages/studio-host.vue',
    ]
    const files = [
      ...collectSourceFiles('packages/cms/src'),
      ...collectSourceFiles('packages/cms/studio-app/src'),
    ]
    const globalBridgeReads = files
      .filter((file) => readFileSync(file, 'utf-8').includes('__GINKO_CMS__'))
      .map((file) => relative(projectRoot, file))
      .filter((file) => !allowedFiles.includes(file))

    expect(globalBridgeReads).toEqual([])
  })
})
