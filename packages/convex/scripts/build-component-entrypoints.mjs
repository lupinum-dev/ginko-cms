import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const componentModules = [
  'agentRuns',
  'assets',
  'auth/appIdentity',
  'assetRecovery',
  'collections',
  'collections/contracts',
  'diagnostics',
  'draftPreview',
  'editor',
  'entries/draft',
  'entries/publish',
  'entries/read',
  'entries/tree',
  'liveFixtures',
  'liveFixtures/cleanup',
  'liveFixtures/finalize',
  'maintenance',
  'members',
  'contractTransitions',
  'mcpOAuthDelegations',
  'operations',
  'contract',
  'portability',
  'portability/runs',
  'public',
  'revalidation',
  'reviewRequests',
  'settings',
  'siteData',
  'storageMaintenance',
]

const outDir = new URL('../dist/component/', import.meta.url)

async function write(relativePath, source) {
  const target = join(outDir.pathname, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, source)
}

await rm(outDir, { recursive: true, force: true })

await write(
  'convex.config.js',
  "import { defineComponent } from 'convex/server'\n\nexport default defineComponent('ginkoCms')\n",
)
await write(
  'convex.config.d.ts',
  "import type { ComponentDefinition } from 'convex/server'\n\ndeclare const component: ComponentDefinition\nexport default component\n",
)

await write('schema.js', "export { default } from '../schema.js'\n")
await write('schema.d.ts', "export { default } from '../schema.js'\n")

await write('crons.js', "export { default } from '../crons.js'\n")
await write('crons.d.ts', "export { default } from '../crons.js'\n")

for (const modulePath of componentModules) {
  const parentSegments = '../'.repeat(modulePath.split('/').length - 1)
  await write(`${modulePath}.js`, `export * from '../${parentSegments}${modulePath}.js'\n`)
  await write(`${modulePath}.d.ts`, `export * from '../${parentSegments}${modulePath}.js'\n`)
}
