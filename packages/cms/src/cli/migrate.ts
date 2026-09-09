import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import {
  assessFilesystemPortability,
  exportFilesystemToPortableDirectory,
  type FilesystemPortabilityAssessment,
  verifyPortableDirectoryBounded,
} from '@lupinum/ginko-content/portability/node'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { checkConvexComponentInstall, writeConvexSetupFiles } from '../module/convex.js'
import {
  applyPreparedPortableDraftImport,
  preparePortableDraftImport,
  type PreparedPortableDraftImport,
} from '../portability/commands.js'
import { type CliIo, type ConvexClientFactory, hasFlag, readFlag, write } from './args.js'
import { runNodeScript } from './convex.js'
import { cmsSiteOrigin, convexDeploymentId, publicConvexUrl, readLocalEnv } from './env.js'
import { authorizeOperatorInBrowser } from './operator-browser-login.js'
import { createOperatorContextFromToken } from './operator.js'

const api = anyApi
const DEFAULT_EVIDENCE = '.ginko/migrations/from-content.json'
const require = createRequire(import.meta.url)

type ContentPortabilityApi = {
  assessFilesystemPortability: typeof assessFilesystemPortability
  exportFilesystemToPortableDirectory: typeof exportFilesystemToPortableDirectory
}

type PublicationEntry = {
  entryId: string
  locales: string[]
  pendingLocales: string[]
  expectedVersion: number
  draftSha256: string
}

type PublicationIdentity = {
  entryId: string
  collection: string
  canonicalKey: string
  locale: string
}

type MigrationEvidence = {
  format: 'ginko-cms-content-migration'
  version: 1
  sourceRoot: string
  portableDirectory: string
  manifestSha256: string
  target: {
    selector: 'local'
    deploymentId: string
    convexUrl: string
    siteOrigin: string
    contentHash: string
  }
  plan: PreparedPortableDraftImport
  planId: string
  runId: string
  payloadSha256: string
  counts: {
    documents: number
    assets: number
    collections: number
    locales: number
    create: number
    update: number
    skip: number
  }
  publication: null | {
    sha256: string
    entries: PublicationEntry[]
  }
}

export async function runMigrateCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
  dependencies: {
    authorize?: typeof authorizeOperatorInBrowser
    content?: ContentPortabilityApi
    apply?: typeof applyPreparedPortableDraftImport
  } = {},
): Promise<number> {
  if (args[1] !== 'from-content') {
    throw new Error('ginko-cms migrate requires `from-content`.')
  }
  const modes = ['--apply', '--publish-preview', '--publish', '--status'].filter((flag) =>
    hasFlag(args, flag),
  )
  if (modes.length > 1) throw new Error('Choose only one migration phase.')
  const evidencePath = resolve(cwd, readFlag(args, '--evidence') ?? DEFAULT_EVIDENCE)

  if (modes.length === 0) {
    return await prepareMigration(args, cwd, io, evidencePath, convexClientFactory, dependencies)
  }
  const evidence = readEvidence(evidencePath)
  assertTargetStillMatches(cwd, evidence)
  const context = await migrationOperator(cwd, io, convexClientFactory, dependencies.authorize)

  if (hasFlag(args, '--apply')) {
    const prepared = evidence.plan
    await (dependencies.apply ?? applyPreparedPortableDraftImport)(context.client, prepared, {
      cmsOrigin: evidence.target.siteOrigin,
      authorization: context.authorization,
    })
    const publication = await inspectPublicationSet(context.client, evidence)
    if (evidence.publication) {
      const comparison = comparePublication(evidence.publication.entries, publication.entries)
      if (comparison.conflicted > 0) {
        write(
          io.stderr,
          `Migration apply is complete, but the reviewed publication baseline is stale: committed=${comparison.committed}, remaining=${comparison.remaining}, conflicted=${comparison.conflicted}.\n`,
        )
        return 4
      }
    } else {
      evidence.publication = {
        entries: publication.entries,
        sha256: await publicationHash(evidence, publication.entries),
      }
      writeEvidence(evidencePath, evidence, true)
    }
    write(
      io.stdout,
      `Migration drafts applied: documents=${evidence.counts.documents}, publication-entries=${publication.entries.length}, publication=${evidence.publication.sha256}.\n`,
    )
    return 0
  }

  if (hasFlag(args, '--status')) {
    return await reportStatus(context.client, evidence, io)
  }

  const publication = requiredPublication(evidence)
  const current = await inspectPublicationSet(context.client, evidence)
  const comparison = comparePublication(publication.entries, current.entries)
  if (comparison.conflicted > 0) {
    write(
      io.stderr,
      `Migration publication is stale: committed=${comparison.committed}, remaining=${comparison.remaining}, conflicted=${comparison.conflicted}. Run --status and prepare a new reviewed migration for changed drafts.\n`,
    )
    return 4
  }
  if (hasFlag(args, '--publish-preview')) {
    const report = {
      sha256: publication.sha256,
      entries: publication.entries.map(({ entryId, locales, expectedVersion, draftSha256 }) => ({
        entryId,
        locales,
        expectedVersion,
        draftSha256,
      })),
    }
    write(
      io.stdout,
      `Migration publication preview: entries=${publication.entries.length}, committed=${comparison.committed}, remaining=${comparison.remaining}, conflicted=0.\nExact revision report (${evidencePath}):\n${JSON.stringify(report, null, 2)}\nTo publish this exact revision set, run:\n  ginko-cms migrate from-content --publish ${publication.sha256}\n`,
    )
    return 0
  }

  const approved = readFlag(args, '--publish')
  if (approved !== publication.sha256) {
    throw new Error('The publication approval hash does not match this migration revision set.')
  }
  return await publishMigration(context.client, evidence, current.entries, io)
}

async function prepareMigration(
  args: string[],
  cwd: string,
  io: CliIo,
  evidencePath: string,
  convexClientFactory: ConvexClientFactory,
  dependencies: {
    authorize?: typeof authorizeOperatorInBrowser
    content?: ContentPortabilityApi
    apply?: typeof applyPreparedPortableDraftImport
  },
) {
  if (existsSync(evidencePath)) {
    throw new Error(
      `Migration evidence already exists at ${evidencePath}. Use --status or choose another --evidence file.`,
    )
  }
  const sourceArg = args[2] && !args[2]!.startsWith('--') ? args[2]! : '.'
  const sourceRoot = resolve(cwd, sourceArg)
  const target = readFlag(args, '--target')
  if (target !== 'local') throw new Error('The first migration run requires --target local.')
  const content = dependencies.content ?? {
    assessFilesystemPortability,
    exportFilesystemToPortableDirectory,
  }
  const assessment = await content.assessFilesystemPortability({ rootDir: sourceRoot })
  writeAssessment(io, assessment)
  if (
    !assessment.ok ||
    assessment.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  ) {
    return 2
  }

  if (!assessment.evidence) throw new Error('Ginko Content assessment evidence is missing.')
  const { exported, manifestSha256, portableDirectory, verified } =
    await stagePortableMigrationSnapshot({
      content,
      sourceRoot,
      migrationDirectory: dirname(evidencePath),
      inputHash: assessment.evidence.inputHash,
    })
  const contentHash = await hashJson(verified.contract)

  await prepareLocalTarget(cwd, io)
  const deploymentId = convexDeploymentId(cwd)
  const convexUrl = publicConvexUrl(cwd)
  if (!isLocalMigrationTarget(deploymentId, convexUrl)) {
    throw new Error('Migration target is not an actual local Convex deployment.')
  }
  const siteOrigin = cmsSiteOrigin(cwd)
  const context = await migrationOperator(cwd, io, convexClientFactory, dependencies.authorize)

  const prepared = await preparePortableDraftImport(context.client, portableDirectory, {
    deploymentId,
    targetContentHash: contentHash,
  })
  const counts = countPlanEffects(prepared)
  const evidence: MigrationEvidence = {
    format: 'ginko-cms-content-migration',
    version: 1,
    sourceRoot: relative(cwd, sourceRoot) || '.',
    portableDirectory: relative(cwd, portableDirectory),
    manifestSha256,
    target: { selector: 'local', deploymentId, convexUrl, siteOrigin, contentHash },
    plan: { ...prepared, directory: portableDirectory },
    planId: prepared.planId,
    runId: prepared.runId,
    payloadSha256: prepared.payloadSha256,
    counts: {
      documents: exported.documents,
      assets: exported.assets,
      collections: exported.collections.length,
      locales: exported.locales.length,
      ...counts,
    },
    publication: null,
  }
  writeEvidence(evidencePath, evidence)
  write(
    io.stdout,
    `Migration plan ready: documents=${evidence.counts.documents}, assets=${evidence.counts.assets}, collections=${evidence.counts.collections}, locales=${evidence.counts.locales}, create=${counts.create}, update=${counts.update}, skip=${counts.skip}, manifest=${manifestSha256}.\nReview it, then run ginko-cms migrate from-content --apply.\n`,
  )
  return 0
}

export function isLocalMigrationTarget(deploymentId: string, convexUrl: string) {
  if (
    !deploymentId.startsWith('local:') &&
    !deploymentId.startsWith('local-') &&
    !deploymentId.startsWith('anonymous:')
  ) {
    return false
  }
  try {
    const url = new URL(convexUrl)
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' ||
        url.hostname.endsWith('.localhost') ||
        /^127(?:\.\d{1,3}){3}$/u.test(url.hostname) ||
        url.hostname === '[::1]') &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

export async function stagePortableMigrationSnapshot(options: {
  content: ContentPortabilityApi
  sourceRoot: string
  migrationDirectory: string
  inputHash: string
}) {
  mkdirSync(options.migrationDirectory, { recursive: true, mode: 0o700 })
  chmodSync(options.migrationDirectory, 0o700)
  const portableDirectory = resolve(options.migrationDirectory, 'portable')
  const stagedPortableDirectory = resolve(options.migrationDirectory, '.portable.next')
  rmSync(stagedPortableDirectory, { recursive: true, force: true })
  try {
    const exported = await options.content.exportFilesystemToPortableDirectory({
      rootDir: options.sourceRoot,
      destination: stagedPortableDirectory,
      expectedInputHash: options.inputHash,
    })
    if (existsSync(portableDirectory)) {
      const existing = await verifyPortableDirectoryBounded(portableDirectory)
      const existingManifestSha256 = await hashJson(existing.manifest)
      if (existingManifestSha256 !== exported.manifestSha256) {
        throw new Error(
          'Existing migration portable data belongs to a different source snapshot. Choose another --evidence file or remove the abandoned generated migration directory.',
        )
      }
      rmSync(stagedPortableDirectory, { recursive: true, force: true })
    } else {
      renameSync(stagedPortableDirectory, portableDirectory)
    }
    const verified = await verifyPortableDirectoryBounded(portableDirectory)
    const manifestSha256 = await hashJson(verified.manifest)
    if (manifestSha256 !== exported.manifestSha256) {
      throw new Error('Ginko Content export manifest does not match local verification.')
    }
    return { exported, manifestSha256, portableDirectory, verified }
  } catch (error) {
    rmSync(stagedPortableDirectory, { recursive: true, force: true })
    throw error
  }
}

async function prepareLocalTarget(cwd: string, io: CliIo) {
  const setup = writeConvexSetupFiles(cwd)
  if (setup.conflicts.length > 0) {
    throw new Error(
      `CMS setup conflicts with ${setup.conflicts.map((conflict) => conflict.path).join(', ')}. Resolve the generated-file conflicts before migration.`,
    )
  }
  const issues = checkConvexComponentInstall(cwd)
  if (issues.length > 0) {
    throw new Error(
      `CMS setup is incomplete: ${issues.map((issue) => `${issue.message} Fix: ${issue.fix}`).join(' ')}`,
    )
  }
  const configured = readLocalEnv(cwd).CONVEX_DEPLOYMENT ?? process.env.CONVEX_DEPLOYMENT
  if (configured) return

  write(io.stdout, 'No target is configured. Starting the supported Better Convex local setup.\n')
  const packageJsonPath = require.resolve('@lupinum/better-convex-nuxt/package.json', {
    paths: [cwd],
  })
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    bin?: string | Record<string, string>
  }
  const bin =
    typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.['better-convex']
  if (!bin) throw new Error('Installed Better Convex does not expose its supported CLI.')
  const status = await runNodeScript(
    resolve(dirname(packageJsonPath), bin),
    ['convex', 'dev', '--once', '--typecheck', 'disable', '--tail-logs', 'disable'],
    { cwd },
  )
  if (status !== 0) throw new Error('Better Convex local target setup did not complete.')
  if (!readLocalEnv(cwd).CONVEX_DEPLOYMENT) {
    throw new Error('Better Convex local setup completed without selecting a deployment.')
  }
  assertNoTargetConflicts(cwd)
}

async function migrationOperator(
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory,
  authorize: typeof authorizeOperatorInBrowser = authorizeOperatorInBrowser,
) {
  const origin = cmsSiteOrigin(cwd)
  write(io.stdout, `Opening ${origin}/studio for owner authorization.\n`)
  const token = await authorize(origin)
  const context = createOperatorContextFromToken(cwd, token, convexClientFactory)
  const access = (await context.client.query(api.ginkoCms.members.getAccessContext, {})) as {
    role?: string | null
    can?: Record<string, boolean>
  } | null
  if (access?.role !== 'owner' || access.can?.[cmsPermissionKeys.managePortability] !== true) {
    throw new Error('Migration requires a verified current CMS owner with portability permission.')
  }
  return context
}

async function inspectPublicationSet(
  client: ReturnType<typeof createOperatorContextFromToken>['client'],
  evidence: MigrationEvidence,
) {
  const identities: PublicationIdentity[] = []
  let cursor: number | null = null
  do {
    const page = (await client.query(api.ginkoCms.portability.listImportPublicationIdentities, {
      runId: evidence.runId,
      payloadSha256: evidence.payloadSha256,
      cursor,
      limit: 100,
    })) as { identities: PublicationIdentity[]; cursor: number | null }
    identities.push(...page.identities)
    cursor = page.cursor
  } while (cursor !== null)
  if (identities.length === 0) throw new Error('Migration publication set is empty.')

  const grouped = new Map<
    string,
    { entryId: string; collection: string; canonicalKey: string; locales: string[] }
  >()
  for (const identity of identities) {
    const existing = grouped.get(identity.entryId)
    if (existing) {
      if (
        existing.collection !== identity.collection ||
        existing.canonicalKey !== identity.canonicalKey
      ) {
        throw new Error('Migration publication entry has inconsistent source identities.')
      }
      existing.locales.push(identity.locale)
    } else {
      grouped.set(identity.entryId, {
        entryId: identity.entryId,
        collection: identity.collection,
        canonicalKey: identity.canonicalKey,
        locales: [identity.locale],
      })
    }
  }
  const parentByIdentity = new Map<string, string | null>()
  for (const item of evidence.plan.items) {
    const key = `${item.document.collection}\0${item.document.canonicalKey}`
    const parent = item.document.parentCanonicalKey
    const current = parentByIdentity.get(key)
    if (current !== undefined && current !== parent) {
      throw new Error('Migration publication entry has inconsistent parent identities.')
    }
    parentByIdentity.set(key, parent)
  }
  const depthByIdentity = new Map<string, number>()
  const depth = (collection: string, canonicalKey: string, stack = new Set<string>()): number => {
    const key = `${collection}\0${canonicalKey}`
    const cached = depthByIdentity.get(key)
    if (cached !== undefined) return cached
    if (stack.has(key)) throw new Error('Migration publication parent graph contains a cycle.')
    const parent = parentByIdentity.get(key)
    if (!parent) return 0
    stack.add(key)
    const value = depth(collection, parent, stack) + 1
    stack.delete(key)
    depthByIdentity.set(key, value)
    return value
  }
  const requested = [...grouped.values()]
    .map((entry) => ({ ...entry, locales: [...new Set(entry.locales)].sort() }))
    .sort(
      (left, right) =>
        depth(left.collection, left.canonicalKey) - depth(right.collection, right.canonicalKey) ||
        left.entryId.localeCompare(right.entryId),
    )
  const entries: PublicationEntry[] = []
  for (let index = 0; index < requested.length; index += 100) {
    const page = (await client.query(api.ginkoCms.portability.inspectImportPublicationEntries, {
      runId: evidence.runId,
      payloadSha256: evidence.payloadSha256,
      entries: requested.slice(index, index + 100),
    })) as { entries: PublicationEntry[] }
    entries.push(...page.entries)
  }
  const byEntryId = new Map(entries.map((entry) => [entry.entryId, entry]))
  return { entries: requested.map((entry) => byEntryId.get(entry.entryId)!) }
}

async function publishMigration(
  client: ReturnType<typeof createOperatorContextFromToken>['client'],
  evidence: MigrationEvidence,
  currentEntries: PublicationEntry[],
  io: CliIo,
) {
  let committed = currentEntries.filter((entry) => entry.pendingLocales.length === 0).length
  let remaining = currentEntries.length - committed
  for (const current of currentEntries) {
    if (current.pendingLocales.length === 0) continue
    try {
      const args = {
        entryId: current.entryId,
        locales: current.pendingLocales,
        expectedVersion: current.expectedVersion,
        message: `Published from portable migration ${evidence.manifestSha256.slice(0, 12)}.`,
      }
      const preview = (await client.mutation(
        api.ginkoCms.editor.previewPublishEntryOperation,
        args,
      )) as { allowed: boolean; confirmation: { token: string } | null; blockers?: unknown[] }
      if (!preview.allowed || !preview.confirmation) throw new Error('Publish preview is blocked.')
      const result = (await client.mutation(api.ginkoCms.editor.publishEntry, {
        ...args,
        _confirmationToken: preview.confirmation.token,
      })) as { status: string }
      if (result.status !== 'applied') throw new Error(`Publish returned ${result.status}.`)
      committed += 1
      remaining -= 1
    } catch (error) {
      write(
        io.stderr,
        `Migration publication stopped: committed=${committed}, remaining=${remaining}, conflicted=0, entry=${expected.entryId}, error=${error instanceof Error ? error.message : String(error)}. Resume with the same --publish hash.\n`,
      )
      return 1
    }
  }
  write(
    io.stdout,
    `Migration publication complete: committed=${committed}, remaining=0, conflicted=0.\n`,
  )
  return 0
}

async function reportStatus(
  client: ReturnType<typeof createOperatorContextFromToken>['client'],
  evidence: MigrationEvidence,
  io: CliIo,
) {
  const run = (await client.query(api.ginkoCms.portability.getPortabilityRunStatus, {
    runId: evidence.runId,
  })) as { state: string; committedItemCount: number; itemCount: number }
  if (!evidence.publication || run.state !== 'complete') {
    write(
      io.stdout,
      `Migration status: import=${run.state}, documents=${run.committedItemCount}/${run.itemCount}, publication=not-ready.\n`,
    )
    return 0
  }
  const current = await inspectPublicationSet(client, evidence)
  const comparison = comparePublication(evidence.publication.entries, current.entries)
  write(
    io.stdout,
    `Migration status: import=complete, documents=${run.committedItemCount}/${run.itemCount}, publication=${comparison.committed}/${evidence.publication.entries.length}, remaining=${comparison.remaining}, conflicted=${comparison.conflicted}.\n`,
  )
  return comparison.conflicted > 0 ? 4 : 0
}

function comparePublication(expected: PublicationEntry[], current: PublicationEntry[]) {
  let committed = 0
  let remaining = 0
  let conflicted = 0
  for (const entry of expected) {
    const now = current.find((value) => value.entryId === entry.entryId)
    if (
      !now ||
      now.draftSha256 !== entry.draftSha256 ||
      now.expectedVersion !== entry.expectedVersion ||
      JSON.stringify(now.locales) !== JSON.stringify(entry.locales)
    ) {
      conflicted += 1
    } else if (now.pendingLocales.length === 0) committed += 1
    else remaining += 1
  }
  return { committed, remaining, conflicted }
}

async function publicationHash(evidence: MigrationEvidence, entries: PublicationEntry[]) {
  return await hashJson({
    deploymentId: evidence.target.deploymentId,
    manifestSha256: evidence.manifestSha256,
    planId: evidence.planId,
    runId: evidence.runId,
    payloadSha256: evidence.payloadSha256,
    entries: entries.map(({ entryId, locales, expectedVersion, draftSha256 }) => ({
      entryId,
      locales,
      expectedVersion,
      draftSha256,
    })),
  })
}

function requiredPublication(evidence: MigrationEvidence) {
  if (!evidence.publication) throw new Error('Apply the migration drafts before publication.')
  return evidence.publication
}

function assertTargetStillMatches(cwd: string, evidence: MigrationEvidence) {
  assertNoTargetConflicts(cwd)
  if (
    convexDeploymentId(cwd) !== evidence.target.deploymentId ||
    publicConvexUrl(cwd) !== evidence.target.convexUrl ||
    cmsSiteOrigin(cwd) !== evidence.target.siteOrigin
  ) {
    throw new Error('Current target configuration does not match the reviewed migration evidence.')
  }
}

function assertNoTargetConflicts(cwd: string) {
  const local = readLocalEnv(cwd)
  const pairs = [
    ['CONVEX_DEPLOYMENT', process.env.CONVEX_DEPLOYMENT, local.CONVEX_DEPLOYMENT],
    [
      'CONVEX_URL',
      process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL,
      local.NUXT_PUBLIC_CONVEX_URL ?? local.CONVEX_URL,
    ],
    [
      'SITE_URL',
      process.env.SITE_URL ?? process.env.NUXT_PUBLIC_SITE_URL,
      local.SITE_URL ?? local.NUXT_PUBLIC_SITE_URL,
    ],
  ] as const
  for (const [name, environment, file] of pairs) {
    if (environment?.trim() && file?.trim() && environment.trim() !== file.trim()) {
      throw new Error(`${name} conflicts between the process environment and .env.local.`)
    }
  }
}

function writeAssessment(io: CliIo, assessment: FilesystemPortabilityAssessment) {
  for (const diagnostic of assessment.diagnostics) {
    const location = [diagnostic.file, diagnostic.field].filter(Boolean).join(':')
    write(
      diagnostic.severity === 'error' ? io.stderr : io.stdout,
      `${diagnostic.severity.toUpperCase()} ${diagnostic.code}${location ? ` ${location}` : ''}: ${diagnostic.message}${diagnostic.resolution ? ` Fix: ${diagnostic.resolution}` : ''}\n`,
    )
  }
}

function readEvidence(path: string): MigrationEvidence {
  const value = JSON.parse(readFileSync(path, 'utf8')) as MigrationEvidence
  if (value?.format !== 'ginko-cms-content-migration' || value.version !== 1) {
    throw new Error('Migration evidence is invalid.')
  }
  return value
}

function writeEvidence(path: string, value: MigrationEvidence, replace = false) {
  if (replace && existsSync(path))
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  else writePrivateJson(path, value)
  chmodSync(path, 0o600)
}

function writePrivateJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
}

function countPlanEffects(prepared: PreparedPortableDraftImport) {
  const count = (effect: string) =>
    prepared.items.filter((item) => item.payload.effect === effect).length
  return { create: count('create'), update: count('update'), skip: count('skip') }
}

async function hashJson(value: unknown) {
  return await hashCanonicalJson(value as JsonValue)
}
