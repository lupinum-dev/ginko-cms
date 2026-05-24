import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  defineComponentBridgeManifest,
  resolveConvexAppBinding,
} from '@lupinum/trellis-bridge/manifest'

import { bridgeModuleRegistry, defaultBridgeImports } from '../dist/bridge/registry.js'
const generatedFiles = ['convex/auth.ts', 'convex/http.ts', 'convex/ginkoCms/_caller.ts']
function ginkoModule(relativePath, factoryName, factoryPath, componentPath, entries) {
  return {
    relativePath,
    factory: {
      name: factoryName,
      from: factoryPath,
    },
    imports: [...defaultBridgeImports],
    factoryArgs: {
      component: 'component',
      components: `components.${componentPath}`,
    },
    exportNames: entries.map((entry) => entry.exportName),
  }
}
function bridgeRegistryModule(module) {
  if (module.imports || module.factoryArgs || module.exportNames) {
    if (!module.factoryArgs) {
      throw new Error(
        `Bridge registry module ${module.relativePath} is missing custom factory metadata.`,
      )
    }
    return {
      relativePath: module.relativePath,
      factory: {
        name: module.factoryName,
        from: module.factoryPath,
      },
      imports: module.imports ?? defaultBridgeImports,
      factoryArgs: module.factoryArgs,
      exportNames: [...(module.exportNames ?? module.entries.map((entry) => entry.exportName))],
    }
  }
  if (!module.componentPath) {
    throw new Error(`Bridge registry module ${module.relativePath} is missing componentPath.`)
  }
  return ginkoModule(
    module.relativePath,
    module.factoryName,
    module.factoryPath,
    module.componentPath,
    module.entries,
  )
}
const bridgeModules = bridgeModuleRegistry.map(bridgeRegistryModule)
function findPackageRoot(startFileUrl) {
  let current = dirname(fileURLToPath(startFileUrl))
  while (true) {
    const packageJsonPath = resolve(current, 'package.json')
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
      if (packageJson.name === '@lupinum/ginko-cms') return current
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error('Could not locate @lupinum/ginko-cms package root for bridge manifest.')
    }
    current = parent
  }
}
const rootDir = findPackageRoot(import.meta.url)
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
function readTemplateFile(relativePath) {
  const templatePath = resolve(rootDir, 'templates', relativePath.replace(/^convex\//, 'convex/'))
  return readFileSync(templatePath, 'utf8')
}
function removeDanglingCommas(source) {
  return source.replace(/,(\n\s*[}\])])/g, '$1')
}
function normalizeLine(line) {
  let normalized = line.trim().replaceAll('\t', ' ')
  while (normalized.includes('  ')) {
    normalized = normalized.replaceAll('  ', ' ')
  }
  return normalized
}
function isStandaloneUseForApp(line, appName, componentName) {
  const normalized = normalizeLine(line)
  const call = `${appName}.use(${componentName})`
  return normalized === call || normalized === `${call};`
}
function hasBetterAuthRegistrationForApp(source, appName) {
  const pattern = new RegExp(
    String.raw`\b${escapeRegExp(appName)}\.use\(\s*betterAuth\s*,\s*\{[\s\S]*?\bname\s*:\s*['"]betterAuth['"]`,
  )
  return pattern.test(source)
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function includesImport(source, binding, specifier) {
  const pattern = new RegExp(
    String.raw`^\s*import\s+${binding}\s+from\s+['"]${escapeRegExp(specifier)}['"]\s*;?\s*$`,
    'm',
  )
  return pattern.test(source)
}
function includesNamedImport(source, name, specifier) {
  const pattern = new RegExp(
    String.raw`^\s*import\s+\{[^}]*\b${name}\b[^}]*\}\s+from\s+['"]${escapeRegExp(specifier)}['"]\s*;?\s*$`,
    'm',
  )
  return pattern.test(source)
}
export class GinkoCmsHostSetupValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GinkoCmsHostSetupValidationError'
  }
}
function requireExistingHostSetup(relativePath, current, checks, snippet) {
  const failures = checks.filter((check) => !check.ok)
  if (failures.length === 0) return current
  throw new GinkoCmsHostSetupValidationError(
    [
      `${relativePath} exists, so Ginko CMS will not rewrite it automatically.`,
      ...failures.map((failure) => `- ${failure.message}`),
      'Apply this setup explicitly, then rerun `pnpm exec ginko-cms doctor`:',
      snippet.trimEnd(),
    ].join('\n'),
  )
}
export function renderConvexConfig(current) {
  const canonicalImport = "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'"
  if (!current) {
    current = [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      canonicalImport,
      '',
      'const app = defineApp()',
      '',
      "app.use(betterAuth, { name: 'betterAuth' })",
      'app.use(ginkoCms)',
      '',
      'export default app',
      '',
    ].join('\n')
  }
  const binding = resolveConvexAppBinding(current)
  return requireExistingHostSetup(
    'convex/convex.config.ts',
    current,
    [
      {
        ok: includesImport(current, 'betterAuth', '@convex-dev/better-auth/convex.config'),
        message: 'Import Better Auth from @convex-dev/better-auth/convex.config.',
      },
      {
        ok: includesNamedImport(current, 'defineApp', 'convex/server'),
        message: 'Import defineApp from convex/server.',
      },
      {
        ok: includesImport(current, 'ginkoCms', '@lupinum/ginko-cms-convex/convex.config'),
        message: 'Import ginkoCms from @lupinum/ginko-cms-convex/convex.config.',
      },
      {
        ok: Boolean(binding),
        message: 'Create the Convex app with defineApp().',
      },
      {
        ok:
          binding !== null &&
          current
            .split('\n')
            .some((line) => isStandaloneUseForApp(line, binding.appName, 'ginkoCms')),
        message: 'Register the Ginko CMS Convex component with app.use(ginkoCms).',
      },
      {
        ok: binding !== null && hasBetterAuthRegistrationForApp(current, binding.appName),
        message: 'Register Better Auth with app.use(betterAuth, { name: "betterAuth" }).',
      },
      {
        ok:
          !current.includes('@trellis-managed-start') && !current.includes('@trellis-managed-end'),
        message: 'Remove old @trellis-managed comments; convex.config.ts is app-owned.',
      },
    ],
    [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      canonicalImport,
      '',
      'const app = defineApp()',
      "app.use(betterAuth, { name: 'betterAuth' })",
      'app.use(ginkoCms)',
      '',
      'export default app',
      '',
    ].join('\n'),
  )
}
export function renderAuthConfig(current) {
  if (!current) return removeDanglingCommas(readTemplateFile('convex/auth.config.ts'))
  return requireExistingHostSetup(
    'convex/auth.config.ts',
    current,
    [
      {
        ok: includesNamedImport(
          current,
          'getAuthConfigProvider',
          '@lupinum/ginko-cms/convex/auth-config',
        ),
        message: 'Import getAuthConfigProvider from @lupinum/ginko-cms/convex/auth-config.',
      },
      {
        ok: /\bproviders\s*:\s*\[[\s\S]*\bgetAuthConfigProvider\s*\(\s*\)/.test(current),
        message: 'Include getAuthConfigProvider() in the exported providers array.',
      },
    ],
    readTemplateFile('convex/auth.config.ts'),
  )
}
export function renderSchema(current) {
  if (!current) return removeDanglingCommas(readTemplateFile('convex/schema.ts'))
  return requireExistingHostSetup(
    'convex/schema.ts',
    current,
    [
      {
        ok:
          includesNamedImport(current, 'defineSchema', 'convex/server') &&
          includesNamedImport(current, 'defineTable', 'convex/server'),
        message: 'Import defineSchema/defineTable from convex/server.',
      },
      {
        ok: includesNamedImport(current, 'v', 'convex/values'),
        message: 'Import v from convex/values.',
      },
      {
        ok: /\busers\s*:/.test(current) && /\.index\(\s*['"]by_auth_key['"]/.test(current),
        message: 'Define a users table with a by_auth_key index.',
      },
    ],
    readTemplateFile('convex/schema.ts'),
  )
}
export const ginkoCmsBridgeManifest = defineComponentBridgeManifest({
  packageName: '@lupinum/ginko-cms',
  version: packageJson.version,
  modules: bridgeModules,
  renderFiles: () =>
    generatedFiles.map((relativePath) => ({
      relativePath,
      content: removeDanglingCommas(readTemplateFile(relativePath)),
    })),
  managedEdits: [
    {
      relativePath: 'convex/auth.config.ts',
      apply: renderAuthConfig,
    },
    {
      relativePath: 'convex/schema.ts',
      apply: renderSchema,
    },
    {
      relativePath: 'convex/convex.config.ts',
      apply: renderConvexConfig,
    },
  ],
})
export default ginkoCmsBridgeManifest
