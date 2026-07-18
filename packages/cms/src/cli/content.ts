import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import { verifyPortableDirectoryBounded } from '@lupinum/ginko-content/portability/node'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { loadGinkoContentContract } from '../module/content-contract.js'
import {
  applyPreparedPortableDraftImport,
  exportPortablePublishedContent,
  preparePortableDraftImport,
  type PreparedPortableDraftImport,
} from '../portability/commands.js'
import { type CliIo, type ConvexClientFactory, readFlag, write } from './args.js'
import { cmsSiteOrigin, convexDeploymentId } from './env.js'
import { createOperatorContext, type OperatorClient } from './operator.js'
import { loadContentConfig } from './push.js'

const api = anyApi
const PORTABLE_RECEIPT_PAGE_SIZE = 100
const PORTABLE_RECEIPT_MAX_PAGES = 51
type PortableReceiptFilter = 'all' | 'failed' | 'blocked' | 'skipped'
type PortableItemReceipt = {
  index: number
  itemKey: string
  outcome: 'applied' | 'blocked' | 'failed' | 'pending' | 'skipped'
  state: string
  effect: string | null
  resultId: string | null
  committedAt: number | null
}
type PortableRunStatus = {
  runId: string
  mode: 'import' | 'export'
  state: string
  phase: string | null
  generation: number
  leaseExpiresAt: number | null
  attempts: number
  nextAttemptAt: number | null
  lastError: string | null
  deadLetteredAt: number | null
  itemCount: number
  committedItemCount: number
  assetCount: number
  attachedAssetCount: number
  completedAt: number | null
  itemReceipts: PortableItemReceipt[]
}

export async function runContentCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const command = args[1]
  if (command === 'verify') return await verifyCommand(args, cwd, io)
  if (command === 'status') {
    const runId = requiredRunId(args, 'status')
    const receiptFilter = portableReceiptFilter(args)
    const { client } = await createOperatorContext(cwd, convexClientFactory)
    const status = (await client.query(api.ginkoCms.portability.getPortabilityRunStatus, {
      runId,
    })) as PortableRunStatus
    writePortableRunStatus(io, status, receiptFilter === null)
    if (receiptFilter !== null) {
      await writeFilteredPortableReceipts(client, io, runId, receiptFilter)
    }
    return 0
  }
  if (command === 'resume') {
    const runId = requiredRunId(args, 'resume')
    const { client } = await createOperatorContext(cwd, convexClientFactory)
    const status = (await client.action(api.ginkoCms.portability.resumePortabilityRun, {
      runId,
    })) as PortableRunStatus
    write(io.stdout, `Portable run resume requested: ${runId}.\n`)
    writePortableRunStatus(io, status)
    return 0
  }
  if (command === 'export') {
    const output = readFlag(args, '--out')
    if (!output) throw new Error('ginko-cms content export requires --out <directory>.')
    const { client, sessionCookie } = await createOperatorContext(cwd, convexClientFactory)
    const contract = await localContract(cwd)
    const requested = readFlag(args, '--collections')
    const collections = requested
      ? requested
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : Object.keys(contract.collections)
    const unknown = collections.filter((slug) => !contract.collections[slug])
    if (unknown.length > 0) {
      throw new Error(`Portable export scope contains unknown collections: ${unknown.join(', ')}.`)
    }
    const result = await exportPortablePublishedContent(client, resolve(cwd, output), {
      deploymentId: convexDeploymentId(cwd),
      collections,
      contract,
      assetTransfer: {
        cmsOrigin: cmsSiteOrigin(cwd),
        sessionCookie,
      },
    })
    write(
      io.stdout,
      `Published content export complete: scope=${collections.join(',')}, published=${result.documentCount}, assets=${result.assetCount}, manifest=${result.manifestSha256}.\n`,
    )
    return 0
  }
  if (command === 'import') {
    const applyFile = readFlag(args, '--apply')
    if (applyFile) {
      if (readFlag(args, '--plan') || (args[2] && !args[2].startsWith('--'))) {
        throw new Error('ginko-cms content import --apply accepts only one plan file.')
      }
      const { client, sessionCookie } = await createOperatorContext(cwd, convexClientFactory)
      const prepared = await readPreparedPlan(resolve(cwd, applyFile))
      const receipt = (await applyPreparedPortableDraftImport(client, prepared, {
        cmsOrigin: cmsSiteOrigin(cwd),
        sessionCookie,
      })) as { state?: string }
      write(io.stdout, `Import complete: state=${receipt.state ?? 'complete'}.\n`)
      return 0
    }
    const directory = args[2]
    const planFile = readFlag(args, '--plan')
    if (!directory || directory.startsWith('--') || !planFile) {
      throw new Error('ginko-cms content import requires <directory> --plan <file>.')
    }
    const { client } = await createOperatorContext(cwd, convexClientFactory)
    const contract = await localContract(cwd)
    const prepared = await preparePortableDraftImport(client, resolve(cwd, directory), {
      deploymentId: convexDeploymentId(cwd),
      targetContentHash: await hashJson(contract),
    })
    const planPath = resolve(cwd, planFile)
    writeFileSync(planPath, `${JSON.stringify(prepared, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    const effects = countEffects(prepared)
    write(
      io.stdout,
      `Import plan written: ${planPath}\nscope=${prepared.payload.scope.collections.join(',')}, create=${effects.create}, update=${effects.update}, skip=${effects.skip}, assets-upload=${effects.upload}, assets-reuse=${effects.reuse}, blockers=0.\nReview the plan, then run ginko-cms content import --apply ${planPath}.\n`,
    )
    return 0
  }
  throw new Error('ginko-cms content requires export, verify, import, status, or resume.')
}

function requiredRunId(args: string[], command: 'status' | 'resume') {
  const runId = args[2]
  if (!runId || runId.startsWith('--')) {
    throw new Error(`ginko-cms content ${command} requires <run-id>.`)
  }
  return runId
}

function portableReceiptFilter(args: string[]): PortableReceiptFilter | null {
  const filter = readFlag(args, '--items')
  if (filter === undefined) return null
  if (filter === 'all' || filter === 'failed' || filter === 'blocked' || filter === 'skipped') {
    return filter
  }
  throw new Error('ginko-cms content status --items requires failed, blocked, skipped, or all.')
}

function writePortableRunStatus(io: CliIo, status: PortableRunStatus, showRecentReceipts = true) {
  const retry = status.lastError
    ? ` attempts=${status.attempts}, next=${status.nextAttemptAt ?? 'none'}, dead-lettered=${status.deadLetteredAt ?? 'no'}, error=${status.lastError}`
    : ` attempts=${status.attempts}`
  write(
    io.stdout,
    `Portable run ${status.runId}: mode=${status.mode}, state=${status.state}, phase=${status.phase ?? 'none'}, generation=${status.generation}, lease=${status.leaseExpiresAt ?? 'none'}, items=${status.committedItemCount}/${status.itemCount}, assets=${status.attachedAssetCount}/${status.assetCount}, completed=${status.completedAt ?? 'no'},${retry}.\n`,
  )
  if (!showRecentReceipts) return
  if (status.itemReceipts.length === 0) {
    write(io.stdout, 'Item receipts: none.\n')
    return
  }
  write(io.stdout, `Item receipts (latest ${status.itemReceipts.length}):\n`)
  for (const receipt of status.itemReceipts) {
    writePortableItemReceipt(io, receipt)
  }
}

async function writeFilteredPortableReceipts(
  client: OperatorClient,
  io: CliIo,
  runId: string,
  filter: PortableReceiptFilter,
) {
  write(io.stdout, `Item receipts (${filter}):\n`)
  let cursor: number | null = null
  let count = 0
  for (let page = 0; page < PORTABLE_RECEIPT_MAX_PAGES; page += 1) {
    const result = (await client.query(api.ginkoCms.portability.listPortabilityItemReceipts, {
      runId,
      cursor,
      limit: PORTABLE_RECEIPT_PAGE_SIZE,
      filter,
    })) as { receipts: PortableItemReceipt[]; cursor: number | null }
    for (const receipt of result.receipts) {
      writePortableItemReceipt(io, receipt)
      count += 1
    }
    if (result.cursor === null) {
      if (count === 0) write(io.stdout, '  none\n')
      return
    }
    if (result.cursor <= (cursor ?? -1)) {
      throw new Error('Portable receipt cursor did not advance.')
    }
    cursor = result.cursor
  }
  throw new Error(`Portable receipt history for ${runId} exceeded its bounded page count.`)
}

function writePortableItemReceipt(io: CliIo, receipt: PortableItemReceipt) {
  write(
    io.stdout,
    `  ${receipt.index} ${receipt.itemKey} outcome=${receipt.outcome} state=${receipt.state} effect=${receipt.effect ?? 'none'} result=${receipt.resultId ?? 'none'} committed=${receipt.committedAt ?? 'no'}\n`,
  )
}

async function verifyCommand(args: string[], cwd: string, io: CliIo) {
  const directory = args[2]
  if (!directory || directory.startsWith('--')) {
    throw new Error('ginko-cms content verify requires <directory>.')
  }
  const verified = await verifyPortableDirectoryBounded(resolve(cwd, directory))
  const manifestSha256 = await hashJson(verified.manifest)
  write(
    io.stdout,
    `Portable content verified: documents=${verified.manifest.documents.length}, assets=${verified.manifest.assets.length}, manifest=${manifestSha256}.\n`,
  )
  return 0
}

async function localContract(cwd: string) {
  const config = await loadContentConfig(cwd)
  return await loadGinkoContentContract({ rootDir: cwd, content: config.content })
}

async function readPreparedPlan(path: string): Promise<PreparedPortableDraftImport> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as PreparedPortableDraftImport
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.planId !== 'string' ||
    typeof parsed.runId !== 'string' ||
    typeof parsed.directory !== 'string' ||
    typeof parsed.payloadSha256 !== 'string' ||
    !parsed.payload ||
    !Array.isArray(parsed.items) ||
    !Array.isArray(parsed.assets) ||
    !Array.isArray(parsed.blockers) ||
    parsed.blockers.length > 0
  ) {
    throw new Error('Portable import plan file is invalid or blocked.')
  }
  if ((await hashJson(parsed.payload)) !== parsed.payloadSha256) {
    throw new Error('Portable import plan payload hash does not match the file.')
  }
  if (
    parsed.payload.itemCount !== parsed.items.length ||
    parsed.payload.assetCount !== parsed.assets.length ||
    (await hashJson(parsed.items.map((item) => item.payload))) !== parsed.payload.itemRootSha256 ||
    (await hashJson(parsed.assets.map((asset) => asset.payload))) !== parsed.payload.assetRootSha256
  ) {
    throw new Error('Portable import plan rows do not match the payload.')
  }
  const applyOrders = new Set<number>()
  for (const item of parsed.items) {
    if (
      !Number.isSafeInteger(item.applyOrder) ||
      item.applyOrder < 0 ||
      item.applyOrder >= parsed.items.length ||
      applyOrders.has(item.applyOrder) ||
      (await hashJson(item.payload)) !== item.inputSha256 ||
      !item.document ||
      (await hashJson(item.document)) !== item.payload.documentSha256
    ) {
      throw new Error(`Portable import plan item ${item.itemKey} is invalid.`)
    }
    applyOrders.add(item.applyOrder)
  }
  for (const asset of parsed.assets) {
    if ((await hashJson(asset.payload)) !== asset.inputSha256) {
      throw new Error(`Portable import plan asset ${asset.assetKey} is invalid.`)
    }
  }
  return parsed
}

function countEffects(prepared: PreparedPortableDraftImport) {
  const count = (effect: 'create' | 'update' | 'skip') =>
    prepared.items.filter((item) => item.payload.effect === effect).length
  const assets = (effect: 'upload' | 'reuse') =>
    prepared.assets.filter((asset) => asset.payload.effect === effect).length
  return {
    create: count('create'),
    update: count('update'),
    skip: count('skip'),
    upload: assets('upload'),
    reuse: assets('reuse'),
  }
}

async function hashJson(value: unknown) {
  return await hashCanonicalJson(value as JsonValue)
}
