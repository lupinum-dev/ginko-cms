import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import * as ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../..')
const trellisPackageName = ['@lupinum', 'trellis'].join('/')
const trellisBridgePackageName = ['@lupinum', ['trellis', 'bridge'].join('-')].join('/')
const requiredPackageOutputs = [
  'packages/contract/dist/validators.js',
  'packages/contract/dist/convex/caller.js',
  'packages/contract/dist/fields/index.js',
  'packages/convex/dist/component/convex.config.js',
  'packages/convex/dist/convex.auth.js',
  'packages/convex/dist/_generated/component.js',
  'packages/cms/dist/module.mjs',
  'packages/cms/dist/types.d.mts',
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
      './shared/readiness.js',
      './shared/routeDiagnostics.js',
      './shared/types.js',
      './shared/utils.js',
    ])

    expect(Object.keys(convexPackage.exports ?? {}).sort()).toEqual([
      './_generated/component.js',
      './component',
      './convex.auth',
      './convex.config',
      './operations',
    ])

    expect(Object.keys(cmsPackage.exports ?? {}).sort()).toEqual([
      '.',
      './convex/auth',
      './convex/auth-config',
      './nuxt-provider',
      './portability',
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
      'packages/contract/src/readiness.ts',
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
      ({ specifier }) => specifier === 'better-convex-nuxt/composables',
    )

    expect(
      runtimeViolations.map(({ file, specifier }) => `${file} -> ${specifier}`),
      'Studio must use its host-bridge Convex boundary instead of removed Nuxt composable exports',
    ).toEqual([])
  })

  it('bans deleted Better Convex Nuxt vNext imports and old names everywhere in packages/cms', () => {
    // §10 "Ginko tests": "package boundary test banning deleted Better Convex
    // Nuxt imports and old names" — `serverConvexQuery`/`serverConvexMutation`/
    // `serverConvexAction` (replaced by the single `serverConvex` caller),
    // `createBetterConvexAuthClient` (replaced by `defineConvexAuthClient`),
    // library-exported `refreshAuth` (the vNext auth engine has no such
    // export; `refresh()` lives on the returned engine instance, never as a
    // standalone import), and `getQueryKey` (removed from the public surface).
    const bannedNames = [
      'serverConvexQuery',
      'serverConvexMutation',
      'serverConvexAction',
      'createBetterConvexAuthClient',
      'getQueryKey',
    ]
    const files = [
      ...collectSourceFiles('packages/cms/src'),
      ...collectSourceFiles('packages/cms/studio-app/src'),
      ...collectSourceFiles('packages/convex/src'),
    ]
    const violations: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      for (const name of bannedNames) {
        if (new RegExp(`\\b${name}\\b`).test(source)) {
          violations.push(`${relative(projectRoot, file)} -> ${name}`)
        }
      }
      // `refreshAuth` as a *library* export/import is banned; Ginko's own
      // `awaitAuthReady`-successor call sites use `auth.refresh()` as a method,
      // never a bare `refreshAuth` identifier.
      if (/\brefreshAuth\b/.test(source)) {
        violations.push(`${relative(projectRoot, file)} -> refreshAuth`)
      }
      if (/\bawaitAuthReady\b/.test(source)) {
        violations.push(`${relative(projectRoot, file)} -> awaitAuthReady`)
      }
    }

    expect(violations, 'source references a deleted vNext name').toEqual([])

    // Also ban the deleted names from crossing the scripts/package-e2e fixture
    // generator, so a regenerated consumer fixture can never resurrect them.
    const scriptSource = readFileSync(resolve(projectRoot, 'scripts/package-e2e.mjs'), 'utf-8')
    for (const name of ['serverConvexQuery', 'serverConvexMutation', 'serverConvexAction']) {
      expect(scriptSource.includes(name), `scripts/package-e2e.mjs references ${name}`).toBe(false)
    }
    expect(scriptSource).toContain('serverConvex')
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
    expect(convexPackage.dependencies?.['@lupinum/ginko-cms-contract']).toBe(
      'workspace:^0.2.0-rc.1',
    )
    expect(convexPackage.dependencies?.[trellisPackageName]).toBeUndefined()
    expect(convexPackage.dependencies?.[trellisBridgePackageName]).toBeUndefined()

    expect(cmsPackage.dependencies?.['@lupinum/ginko-cms-contract']).toBe('workspace:^0.2.0-rc.1')
    expect(cmsPackage.dependencies?.['@lupinum/ginko-cms-convex']).toBe('workspace:^0.2.0-rc.1')
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
      ['packages/cms/convex', 'ginkoCms'].join('/'),
      ['packages/cms/convex', `ginkoCms${'Mcp.ts'}`].join('/'),
      'packages/cms/dist/package',
    ]

    for (const path of forbiddenPaths) {
      expect(existsSync(resolve(projectRoot, path)), `${path} must not exist`).toBe(false)
    }

    expect(cmsPackage.files).toEqual([
      'compatibility.json',
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
      'agentRuns.js',
      'assets.js',
      'auth/appIdentity.js',
      'backup.js',
      'collections.js',
      'collections/contracts.js',
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
      'mcpCredentials.js',
      'members.js',
      'migrations.js',
      'operations.js',
      'portability.js',
      'portability/runs.js',
      'public.js',
      'revalidation.js',
      'reviewRequests.js',
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

  it('loads representative built package outputs', async () => {
    const [
      contractValidators,
      contractCmsCaller,
      contractFields,
      convexConfig,
      convexAuth,
      cmsModule,
    ] = await Promise.all([
      import('../../packages/contract/dist/validators.js'),
      import('../../packages/contract/dist/convex/caller.js'),
      import('../../packages/contract/dist/fields/index.js'),
      import('../../packages/convex/dist/component/convex.config.js'),
      import('../../packages/convex/dist/convex.auth.js'),
      import('../../packages/cms/dist/module.mjs'),
    ])

    expect(contractValidators.fieldValidator).toBeDefined()
    expect(contractCmsCaller.cmsCallerValidator).toBeDefined()
    expect(contractFields.normalizeFields).toBeTypeOf('function')
    expect(convexConfig.default).toBeDefined()
    expect(convexAuth.defineGinkoAuth).toBeTypeOf('function')
    expect(cmsModule.default).toBeTypeOf('function')
  })

  it('does not read legacy Trellis auth internals', () => {
    const removedAuthEngineKey = ['__', 'trellis', '_auth_engine__'].join('')
    const files = [
      ...collectSourceFiles('packages/cms/src'),
      ...collectSourceFiles('packages/cms/studio-app/src'),
    ]
    const trellisAuthReads = files
      .filter((file) => readFileSync(file, 'utf-8').includes(removedAuthEngineKey))
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
