import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { createJiti } from 'jiti'

import { loadGinkoContentContract } from '../module/content-contract.js'
import { type CliIo, type ConvexClientFactory, hasFlag, usage, write } from './args.js'
import { deployKey, publicConvexUrl } from './env.js'
import { loadContentConfig } from './push.js'

type NodeKind = 'page' | 'folder' | 'group' | 'section' | null

type TransitionLocaleInput = {
  slug: string | null
  values: Record<string, unknown>
  bodyMdc: string
  version: number
}

type TransitionInput = {
  entryId: string
  collection: string
  stableId: string
  lifecycle: 'active' | 'archived'
  draftVersion: number
  sharedVersion: number
  slug: string
  parentEntryId: string | null
  orderRank: string
  nodeKind: NodeKind
  shared: Record<string, unknown>
  locales: Record<string, TransitionLocaleInput>
}

type TransitionLocaleOutput = {
  slug: string | null
  values: Record<string, unknown>
  bodyMdc: string
}

type TransitionOutput = {
  slug: string
  parentEntryId: string | null
  orderRank: string
  nodeKind: NodeKind
  shared: Record<string, unknown>
  locales: Record<string, TransitionLocaleOutput>
}

type ContractTransition = {
  id: string
  sourceHash: string
  up(entry: TransitionInput): TransitionOutput | Promise<TransitionOutput>
}

type TransitionPage = {
  page: Array<{
    entryId: string
    inputDraftVersion: number
    inputHash: string
    current: TransitionInput
  }>
  isDone: boolean
  continueCursor: string
}

type TransitionStatus = {
  runKey: string
  state: string
  fromContentHash: string
  toContentHash: string
  fromPresentationHash: string
  toPresentationHash: string
  generation: number
  scannedCount: number
  stagedCount: number
  validatedCount: number
  appliedCount: number
  pendingCount: number
  lockActive: boolean
  cursor: string | null
}

const OUTPUT_KEYS = new Set(['slug', 'parentEntryId', 'orderRank', 'nodeKind', 'shared', 'locales'])
const LOCALE_OUTPUT_KEYS = new Set(['slug', 'values', 'bodyMdc'])
const PAGE_SIZE = 50
const APPLY_PAGE_SIZE = 25
const ACTOR = 'owner-cli'

function transitionSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function transitionDate() {
  return new Date().toISOString().slice(0, 10)
}

function transitionTemplate(id: string) {
  return `type TransitionInput = {
  entryId: string
  collection: string
  stableId: string
  lifecycle: 'active' | 'archived'
  draftVersion: number
  sharedVersion: number
  slug: string
  parentEntryId: string | null
  orderRank: string
  nodeKind: 'page' | 'folder' | 'group' | 'section' | null
  shared: Record<string, unknown>
  locales: Record<string, {
    slug: string | null
    values: Record<string, unknown>
    bodyMdc: string
    version: number
  }>
}

type TransitionOutput = {
  slug: string
  parentEntryId: string | null
  orderRank: string
  nodeKind: 'page' | 'folder' | 'group' | 'section' | null
  shared: Record<string, unknown>
  locales: Record<string, {
    slug: string | null
    values: Record<string, unknown>
    bodyMdc: string
  }>
}

export default {
  id: '${id}',

  async up(entry: TransitionInput): Promise<TransitionOutput> {
    return {
      slug: entry.slug,
      parentEntryId: entry.parentEntryId,
      orderRank: entry.orderRank,
      nodeKind: entry.nodeKind,
      shared: entry.shared,
      locales: Object.fromEntries(
        Object.entries(entry.locales).map(([locale, value]) => [locale, {
          slug: value.slug,
          values: value.values,
          bodyMdc: value.bodyMdc,
        }]),
      ),
    }
  },
}
`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneInput(input: TransitionInput): TransitionInput {
  return JSON.parse(JSON.stringify(input)) as TransitionInput
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function assertExactKeys(value: Record<string, unknown>, allowed: Set<string>, context: string) {
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  if (extra.length)
    throw new Error(`${context} returned unsupported keys: ${extra.sort().join(', ')}.`)
}

function assertTransitionOutput(value: unknown, context: string): TransitionOutput {
  if (!isRecord(value)) throw new TypeError(`${context} must return an object.`)
  assertExactKeys(value, OUTPUT_KEYS, context)
  if (typeof value.slug !== 'string') throw new TypeError(`${context} returned an invalid slug.`)
  if (value.parentEntryId !== null && typeof value.parentEntryId !== 'string') {
    throw new TypeError(`${context} returned an invalid parentEntryId.`)
  }
  if (typeof value.orderRank !== 'string') {
    throw new TypeError(`${context} returned an invalid orderRank.`)
  }
  if (
    value.nodeKind !== null &&
    value.nodeKind !== 'page' &&
    value.nodeKind !== 'folder' &&
    value.nodeKind !== 'group' &&
    value.nodeKind !== 'section'
  ) {
    throw new TypeError(`${context} returned an invalid nodeKind.`)
  }
  if (!isRecord(value.shared)) throw new TypeError(`${context} returned invalid shared values.`)
  if (!isRecord(value.locales)) throw new TypeError(`${context} returned invalid locales.`)

  const locales: Record<string, TransitionLocaleOutput> = {}
  for (const [locale, candidate] of Object.entries(value.locales)) {
    if (!isRecord(candidate)) throw new TypeError(`${context} returned invalid locale ${locale}.`)
    assertExactKeys(candidate, LOCALE_OUTPUT_KEYS, `${context} locale ${locale}`)
    if (candidate.slug !== null && typeof candidate.slug !== 'string') {
      throw new TypeError(`${context} returned an invalid locale slug for ${locale}.`)
    }
    if (!isRecord(candidate.values)) {
      throw new TypeError(`${context} returned invalid locale values for ${locale}.`)
    }
    if (typeof candidate.bodyMdc !== 'string') {
      throw new TypeError(`${context} returned an invalid locale body for ${locale}.`)
    }
    locales[locale] = {
      slug: candidate.slug,
      values: candidate.values,
      bodyMdc: candidate.bodyMdc,
    }
  }

  return {
    slug: value.slug,
    parentEntryId: value.parentEntryId,
    orderRank: value.orderRank,
    nodeKind: value.nodeKind,
    shared: value.shared,
    locales,
  }
}

function identityOutput(input: TransitionInput): TransitionOutput {
  return {
    slug: input.slug,
    parentEntryId: input.parentEntryId,
    orderRank: input.orderRank,
    nodeKind: input.nodeKind,
    shared: input.shared,
    locales: Object.fromEntries(
      Object.entries(input.locales).map(([locale, value]) => [
        locale,
        { slug: value.slug, values: value.values, bodyMdc: value.bodyMdc },
      ]),
    ),
  }
}

async function loadContractTransition(cwd: string, fileArg: string): Promise<ContractTransition> {
  const file = resolve(cwd, fileArg)
  if (!existsSync(file)) throw new Error(`Contract transition file does not exist: ${file}`)
  const importer = createJiti(import.meta.url, { interopDefault: true })
  const loaded = await importer.import(file)
  const transition = ((loaded as { default?: unknown }).default ??
    loaded) as Partial<ContractTransition>
  if (!isRecord(transition))
    throw new TypeError(`Contract transition must export an object: ${file}`)
  if (typeof transition.id !== 'string' || !transition.id.trim()) {
    throw new TypeError(`Contract transition must define a non-empty id: ${file}`)
  }
  if (typeof transition.up !== 'function') {
    throw new TypeError(`Contract transition "${transition.id}" must define up(entry).`)
  }
  return {
    id: transition.id,
    sourceHash: createHash('sha256').update(readFileSync(file)).digest('hex'),
    up: transition.up,
  }
}

function createTransitionClient(cwd: string, factory: ConvexClientFactory) {
  const client = factory(publicConvexUrl(cwd))
  if (!client.setAdminAuth) {
    throw new Error('ginko-cms contract transition requires Convex deploy-key authentication.')
  }
  client.setAdminAuth(deployKey(cwd))
  return client
}

async function assertDeployedContractBinding(
  client: ReturnType<typeof createTransitionClient>,
  expected: { contentHash: string; presentationHash: string },
) {
  const deployed = (await client.query(
    anyApi.ginkoCms.contractBinding.getExpectedCmsContractBinding,
    {},
  )) as { contentHash: string; presentationHash: string }
  if (
    deployed.contentHash !== expected.contentHash ||
    deployed.presentationHash !== expected.presentationHash
  ) {
    throw new Error(
      'The deployed Convex host binding does not match the transition target. Run `pnpm exec ginko-cms deploy` before staging or activation.',
    )
  }
}

async function readStatus(
  client: ReturnType<typeof createTransitionClient>,
  runId: string,
): Promise<TransitionStatus> {
  return (await client.query(anyApi.ginkoCms.contractTransitions.getContractTransitionStatus, {
    runId,
  })) as TransitionStatus
}

async function beginAndStage(
  cwd: string,
  transition: ContractTransition,
  client: ReturnType<typeof createTransitionClient>,
) {
  const config = await loadContentConfig(cwd)
  const targetContent = await loadGinkoContentContract({ rootDir: cwd, content: config.content })
  if (!isRecord(targetContent))
    throw new TypeError('content.config.ts did not resolve to an object.')
  const targetContentHash = await hashCanonicalJson(targetContent as unknown as JsonValue)
  const targetPresentation = config.presentation
  const targetPresentationHash = await hashCanonicalJson(targetPresentation)
  await assertDeployedContractBinding(client, {
    contentHash: targetContentHash,
    presentationHash: targetPresentationHash,
  })
  const runKey = createHash('sha256')
    .update(
      `${transition.id}:${transition.sourceHash}:${targetContentHash}:${targetPresentationHash}`,
    )
    .digest('hex')
  const begun = (await client.mutation(
    anyApi.ginkoCms.contractTransitions.beginContractTransition,
    {
      runKey,
      targetContent,
      targetContentHash,
      targetPresentation,
      targetPresentationHash,
      actor: ACTOR,
    },
  )) as { runId: string; state: string }

  const counts = { scanned: 0, changed: 0, staged: 0 }
  let status = await readStatus(client, begun.runId)
  if (status.state !== 'staging' && status.state !== 'validating' && status.state !== 'ready') {
    throw new Error(`Contract transition ${begun.runId} cannot stage from state ${status.state}.`)
  }

  while (status.state === 'staging') {
    const cursor = status.cursor
    const page = (await client.query(
      anyApi.ginkoCms.contractTransitions.listContractTransitionPage,
      {
        runId: begun.runId,
        generation: status.generation,
        cursor,
        limit: PAGE_SIZE,
      },
    )) as TransitionPage
    const items = await Promise.all(
      page.page.map(async (item) => {
        const context = `Transition ${transition.id} for ${item.current.collection}/${item.entryId}`
        let output: TransitionOutput
        try {
          output = assertTransitionOutput(await transition.up(cloneInput(item.current)), context)
        } catch (error) {
          throw new Error(`${context} failed: ${errorMessage(error)}`)
        }
        counts.scanned += 1
        if (
          (await hashCanonicalJson(identityOutput(item.current) as unknown as JsonValue)) !==
          (await hashCanonicalJson(output as unknown as JsonValue))
        ) {
          counts.changed += 1
        }
        return {
          entryId: item.entryId,
          inputDraftVersion: item.inputDraftVersion,
          inputHash: item.inputHash,
          outputHash: await hashCanonicalJson(output as unknown as JsonValue),
          output,
        }
      }),
    )
    const staged = (await client.mutation(
      anyApi.ginkoCms.contractTransitions.stageContractTransitionPage,
      {
        runId: begun.runId,
        generation: status.generation,
        cursor,
        limit: PAGE_SIZE,
        items,
      },
    )) as { state: string; staged: number }
    counts.staged += staged.staged
    status = await readStatus(client, begun.runId)
  }

  while (status.state === 'validating') {
    await client.mutation(anyApi.ginkoCms.contractTransitions.validateContractTransitionPage, {
      runId: begun.runId,
      generation: status.generation,
      cursor: status.cursor,
      limit: PAGE_SIZE,
    })
    status = await readStatus(client, begun.runId)
  }

  return { runId: begun.runId, targetContentHash, targetPresentationHash, counts, status }
}

async function applyAllPages(client: ReturnType<typeof createTransitionClient>, runId: string) {
  let applied = 0
  let status = await readStatus(client, runId)
  for (;;) {
    const result = (await client.mutation(
      anyApi.ginkoCms.contractTransitions.applyContractTransitionPage,
      {
        runId,
        generation: status.generation,
        cursor: status.cursor,
        limit: APPLY_PAGE_SIZE,
        actor: ACTOR,
      },
    )) as {
      generation: number
      cursor: string | null
      applied: number
      appliedCount: number
      readyToActivate: boolean
    }
    applied += result.applied
    if (result.readyToActivate) return { applied, appliedCount: result.appliedCount }
    status = {
      ...status,
      state: 'applying',
      generation: result.generation,
      cursor: result.cursor,
      appliedCount: result.appliedCount,
      pendingCount: status.stagedCount - result.appliedCount,
    }
  }
}

function formatStatus(runId: string, status: TransitionStatus) {
  return [
    `Contract transition ${runId}`,
    `  state: ${status.state}`,
    `  lock active: ${status.lockActive ? 'yes' : 'no'}`,
    `  content: ${status.fromContentHash} -> ${status.toContentHash}`,
    `  presentation: ${status.fromPresentationHash} -> ${status.toPresentationHash}`,
    `  generation: ${status.generation}`,
    `  scanned: ${status.scannedCount}`,
    `  staged: ${status.stagedCount}`,
    `  validated: ${status.validatedCount}`,
    `  applied: ${status.appliedCount}`,
    `  pending: ${status.pendingCount}`,
    '',
  ].join('\n')
}

export async function runContractCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  if (args[1] !== 'transition') {
    throw new Error('Unknown contract command. Available command: transition.')
  }
  const subcommand = args[2]
  const transitionsDir = join(cwd, 'ginko', 'transitions')
  if (!subcommand || ['--help', '-h'].includes(subcommand)) {
    write(io.stdout, usage())
    return 0
  }

  if (subcommand === 'create') {
    const name = args.slice(3).join(' ')
    if (!name) throw new Error('ginko-cms contract transition create requires a change name.')
    const slug = transitionSlug(name)
    if (!slug) throw new Error('Contract transition name must contain letters or numbers.')
    const id = `${transitionDate()}-${slug}`
    const file = join(transitionsDir, `${id}.ts`)
    if (existsSync(file)) throw new Error(`Contract transition already exists: ${file}`)
    mkdirSync(transitionsDir, { recursive: true })
    writeFileSync(file, transitionTemplate(id), 'utf8')
    write(io.stdout, `Created contract transition scaffold: ${file}\n`)
    return 0
  }

  if (subcommand === 'list') {
    if (!existsSync(transitionsDir)) {
      write(io.stdout, 'No contract transitions found.\n')
      return 0
    }
    const files = readdirSync(transitionsDir)
      .filter((file) => /\.(?:ts|js|mjs)$/u.test(file))
      .sort((left, right) => left.localeCompare(right))
    write(io.stdout, files.length ? `${files.join('\n')}\n` : 'No contract transitions found.\n')
    return 0
  }

  if (subcommand === 'stage') {
    const fileArg = args[3]
    if (!fileArg) throw new Error('ginko-cms contract transition stage requires a transition file.')
    if (!hasFlag(args, '--yes')) {
      throw new Error(
        'ginko-cms contract transition stage requires --yes because it locks Studio writes.',
      )
    }
    if (!existsSync(resolve(cwd, 'content.config.ts'))) {
      throw new Error(
        'Contract transition staging requires content.config.ts as the target contract.',
      )
    }
    const client = createTransitionClient(cwd, convexClientFactory)
    const transition = await loadContractTransition(cwd, fileArg)
    const result = await beginAndStage(cwd, transition, client)
    write(
      io.stdout,
      `Staged contract transition ${transition.id}: runId=${result.runId}, scanned=${result.counts.scanned}, changed=${result.counts.changed}, staged=${result.counts.staged}.\n`,
    )
    return 0
  }

  const runId = args[3]
  if (!runId) throw new Error(`ginko-cms contract transition ${subcommand} requires a run id.`)

  if (subcommand === 'status') {
    const client = createTransitionClient(cwd, convexClientFactory)
    write(io.stdout, formatStatus(runId, await readStatus(client, runId)))
    return 0
  }
  if (!hasFlag(args, '--yes')) {
    throw new Error(`ginko-cms contract transition ${subcommand} requires --yes.`)
  }
  const client = createTransitionClient(cwd, convexClientFactory)
  if (subcommand === 'apply') {
    const result = await applyAllPages(client, runId)
    write(io.stdout, `Applied contract transition ${runId}: applied=${result.appliedCount}.\n`)
    return 0
  }
  if (subcommand === 'activate') {
    const status = await readStatus(client, runId)
    await assertDeployedContractBinding(client, {
      contentHash: status.toContentHash,
      presentationHash: status.toPresentationHash,
    })
    const result = (await client.mutation(
      anyApi.ginkoCms.contractTransitions.activateContractTransition,
      {
        runId,
        generation: status.generation,
        actor: ACTOR,
      },
    )) as {
      state: 'complete'
      contentHash: string
      presentationHash: string
      appliedCount: number
    }
    write(
      io.stdout,
      `Activated contract content=${result.contentHash}, presentation=${result.presentationHash}; applied=${result.appliedCount}.\n`,
    )
    return 0
  }
  if (subcommand === 'cancel') {
    await client.mutation(anyApi.ginkoCms.contractTransitions.cancelContractTransition, { runId })
    write(io.stdout, `Cancelled contract transition ${runId}.\n`)
    return 0
  }

  throw new Error(
    'Unknown transition command. Available: create, list, stage, status, apply, activate, cancel.',
  )
}
