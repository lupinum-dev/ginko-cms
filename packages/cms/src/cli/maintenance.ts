import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

import { type CliIo, type ConvexClientFactory, hasFlag, readFlag, write } from './args.js'
import { createOperatorContext } from './operator.js'

type RepairPhase =
  | 'entries'
  | 'drafts'
  | 'revisions'
  | 'draftSearchRows'
  | 'publicRows'
  | 'publicSearchRows'
  | 'assetRefs'
  | 'verifyEntries'
  | 'verifyDrafts'
  | 'verifyRevisions'
  | 'verifyDraftSearchRows'
  | 'verifyPublicRows'
  | 'verifyPublicSearchRows'
  | 'verifyAssetRefs'

type ProjectionRepairRun = {
  runId: string
  state: 'running' | 'complete' | 'failed' | 'dead'
  phase: RepairPhase
  cursor: string | null
  generation: number
  canonicalGeneration: number
  workGeneration: number
  workToken: string | null
  workLeaseExpiresAt: number | null
  workAttempts: number
  workNextAttemptAt: number | null
  workLastError: string | null
  workDeadLetteredAt: number | null
  pageSize: number
  autoContinue: boolean
  processedEntries: number
  processedDrafts: number
  processedRevisions: number
  inspectedDraftSearchRows: number
  inspectedPublicRows: number
  inspectedAssetRefs: number
  referencedAssetIds: string[]
  repairedPublicRows: number
  repairedDraftSearchRows: number
  repairedAssetRefSources: number
  deletedOrphans: number
  issueCount: number
  lastIssue: string | null
  createdBy: string
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

type RepairStartArgs = {
  runId: string
  pageSize?: number
  autoContinue?: boolean
}
type RepairResumeArgs = { runId: string; autoContinue?: boolean }
type RepairStatusArgs = { runId: string }
type ArtifactIdArgs = { artifactId: string }

type TerminalAssetCleanupTask = {
  taskId: string
  storageId: string
  uploadSessionId: string | null
  generation: number
  attempts: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

type TerminalAssetCleanupPage = {
  page: TerminalAssetCleanupTask[]
  isDone: boolean
  continueCursor: string
}

type OperationIssue = { code: string; message: string }
type AssetCleanupRetryPreview = {
  allowed: boolean
  summary: string
  blockers: OperationIssue[]
  warnings: OperationIssue[]
  confirmation: { token: string; expiresAt: number } | null
}

type AssetCleanupRetryResult =
  | { status: 'applied'; value: { taskId: string; generation: number } }
  | { status: 'blocked' | 'stale'; code: string; message: string; details: unknown }

const maintenanceFunctions = {
  startRepair: makeFunctionReference<'mutation', RepairStartArgs, ProjectionRepairRun>(
    'ginkoCms/maintenance:startProjectionRepairRun',
  ),
  resumeRepair: makeFunctionReference<'mutation', RepairResumeArgs, ProjectionRepairRun>(
    'ginkoCms/maintenance:resumeProjectionRepairRun',
  ),
  getRepair: makeFunctionReference<'query', RepairStatusArgs, ProjectionRepairRun | null>(
    'ginkoCms/maintenance:getProjectionRepairRun',
  ),
  listTerminalCleanup: makeFunctionReference<
    'query',
    { paginationOpts: { cursor: string | null; numItems: number } },
    TerminalAssetCleanupPage
  >('ginkoCms/maintenance:listTerminalAssetCleanupTasks'),
  previewRetryCleanup: makeFunctionReference<
    'mutation',
    { taskId: string; expectedGeneration: number },
    AssetCleanupRetryPreview
  >('ginkoCms/maintenance:previewRetryAssetCleanupOperation'),
  retryCleanup: makeFunctionReference<
    'mutation',
    { taskId: string; expectedGeneration: number; _confirmationToken: string },
    AssetCleanupRetryResult
  >('ginkoCms/maintenance:retryAssetCleanupOperationExecute'),
  createArtifact: makeFunctionReference<
    'action',
    { assetId: string },
    { artifactId: string; assetId: string; checksum: string; storageRef: string }
  >('ginkoCms/assetRecovery:createAssetRecoveryArtifact'),
  downloadArtifact: makeFunctionReference<
    'action',
    ArtifactIdArgs,
    { artifactId: string; checksum: string; archiveJson: string }
  >('ginkoCms/assetRecovery:downloadAssetRecoveryArtifact'),
  verifyArtifact: makeFunctionReference<
    'action',
    ArtifactIdArgs,
    {
      ok: boolean
      checksumMatches: boolean
      currentDataMatches: boolean
      artifactId: string
    }
  >('ginkoCms/assetRecovery:verifyAssetRecoveryArtifact'),
  previewRestore: makeFunctionReference<'action', ArtifactIdArgs, AssetRestorePreview>(
    'ginkoCms/assetRecovery:previewRestoreAsset',
  ),
  restoreAsset: makeFunctionReference<
    'action',
    { artifactId: string; expectedChecksum: string },
    { artifactId: string; restoredAssetId: string; originalAssetId: string }
  >('ginkoCms/assetRecovery:restoreAsset'),
}

type AssetRestorePreview = {
  artifactId: string
  checksum: string
  applySupported: boolean
  blockers: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
}

export async function runRepairCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const command = args[1]
  const runId = requiredValue(args[2], `ginko-cms repair ${command ?? ''} requires <run-id>.`)
  const { client } = await createOperatorContext(cwd, convexClientFactory)

  if (command === 'start') {
    const pageSize = optionalIntegerFlag(args, '--page-size', 1, 25)
    const status = await client.mutation(maintenanceFunctions.startRepair, {
      runId,
      ...(pageSize === undefined ? {} : { pageSize }),
      autoContinue: !hasFlag(args, '--manual'),
    })
    write(io.stdout, 'Projection/reference repair started.\n')
    writeRepairStatus(io, status)
    return 0
  }

  if (command === 'status') {
    const status = await client.query(maintenanceFunctions.getRepair, { runId })
    if (!status) throw new Error(`Projection/reference repair run "${runId}" was not found.`)
    writeRepairStatus(io, status)
    return status.state === 'failed' || status.state === 'dead' ? 1 : 0
  }

  if (command === 'resume') {
    const status = await client.mutation(maintenanceFunctions.resumeRepair, {
      runId,
      ...(hasFlag(args, '--manual') ? { autoContinue: false } : {}),
    })
    write(io.stdout, 'Projection/reference repair resumed.\n')
    writeRepairStatus(io, status)
    return 0
  }

  throw new Error('ginko-cms repair requires start, status, or resume.')
}

export async function runAssetCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  if (args[1] === 'cleanup') {
    return await runAssetCleanupCommand(args, cwd, io, convexClientFactory)
  }
  if (args[1] !== 'recovery') {
    throw new Error('ginko-cms asset requires the cleanup or recovery command group.')
  }
  const command = args[2]
  const identifier = requiredValue(
    args[3],
    `ginko-cms asset recovery ${command ?? ''} requires an asset or artifact id.`,
  )
  const { client } = await createOperatorContext(cwd, convexClientFactory)

  if (command === 'create') {
    const result = await client.action(maintenanceFunctions.createArtifact, {
      assetId: identifier,
    })
    write(
      io.stdout,
      `Asset recovery artifact created: artifact=${result.artifactId}, asset=${result.assetId}, checksum=${result.checksum}.\n`,
    )
    return 0
  }

  if (command === 'download') {
    const output = readFlag(args, '--out')
    if (!output) {
      throw new Error('ginko-cms asset recovery download requires --out <file>.')
    }
    const result = await client.action(maintenanceFunctions.downloadArtifact, {
      artifactId: identifier,
    })
    const checksum = createHash('sha256').update(result.archiveJson).digest('hex')
    if (checksum !== result.checksum) {
      throw new Error('Downloaded asset recovery checksum does not match the artifact receipt.')
    }
    const path = resolve(cwd, output)
    writeFileSync(path, result.archiveJson, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    write(
      io.stdout,
      `Asset recovery artifact downloaded: artifact=${result.artifactId}, checksum=${checksum}, file=${path}.\n`,
    )
    return 0
  }

  if (command === 'verify') {
    const result = await client.action(maintenanceFunctions.verifyArtifact, {
      artifactId: identifier,
    })
    write(
      io.stdout,
      `Asset recovery verification: artifact=${result.artifactId}, ok=${result.ok}, checksum=${result.checksumMatches}, current-data=${result.currentDataMatches}.\n`,
    )
    return result.ok ? 0 : 1
  }

  if (command === 'preview') {
    const preview = await client.action(maintenanceFunctions.previewRestore, {
      artifactId: identifier,
    })
    writeRestorePreview(io, preview)
    return preview.applySupported ? 0 : 1
  }

  if (command === 'restore') {
    if (!hasFlag(args, '--yes')) {
      throw new Error('ginko-cms asset recovery restore requires --yes after reviewing preview.')
    }
    const expectedChecksum = readFlag(args, '--checksum')
    if (!expectedChecksum || !/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
      throw new Error(
        'ginko-cms asset recovery restore requires --checksum <64-character SHA-256>.',
      )
    }
    const preview = await client.action(maintenanceFunctions.previewRestore, {
      artifactId: identifier,
    })
    writeRestorePreview(io, preview)
    if (!preview.applySupported) return 1
    if (preview.checksum !== expectedChecksum.toLowerCase()) {
      throw new Error('Restore checksum does not match the current preview receipt.')
    }
    const restored = await client.action(maintenanceFunctions.restoreAsset, {
      artifactId: identifier,
      expectedChecksum: preview.checksum,
    })
    write(
      io.stdout,
      `Asset restored: artifact=${restored.artifactId}, original=${restored.originalAssetId}, restored=${restored.restoredAssetId}.\n`,
    )
    return 0
  }

  throw new Error(
    'ginko-cms asset recovery requires create, download, verify, preview, or restore.',
  )
}

async function runAssetCleanupCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory,
): Promise<number> {
  const command = args[2]
  const { client } = await createOperatorContext(cwd, convexClientFactory)
  if (command === 'list') {
    let cursor: string | null = null
    let found = 0
    do {
      const result: TerminalAssetCleanupPage = await client.query(
        maintenanceFunctions.listTerminalCleanup,
        {
          paginationOpts: { cursor, numItems: 100 },
        },
      )
      for (const task of result.page) {
        found += 1
        write(
          io.stdout,
          `Terminal asset cleanup: task=${task.taskId}, generation=${task.generation}, attempts=${task.attempts}, storage=${task.storageId}, session=${task.uploadSessionId ?? 'none'}, updated=${task.updatedAt}, error=${task.lastError ?? 'none'}\n`,
        )
      }
      cursor = result.isDone ? null : result.continueCursor
    } while (cursor)
    if (found === 0) write(io.stdout, 'No terminal asset cleanup failures.\n')
    else write(io.stdout, `Terminal asset cleanup failures: ${found}.\n`)
    return 0
  }

  if (command === 'retry') {
    const taskId = requiredValue(args[3], 'ginko-cms asset cleanup retry requires <task-id>.')
    const expectedGeneration = optionalIntegerFlag(args, '--generation', 1, Number.MAX_SAFE_INTEGER)
    if (expectedGeneration === undefined) {
      throw new Error('ginko-cms asset cleanup retry requires --generation <positive integer>.')
    }
    if (!hasFlag(args, '--yes')) {
      throw new Error(
        'ginko-cms asset cleanup retry requires --yes after reviewing cleanup inventory.',
      )
    }
    const operationArgs = { taskId, expectedGeneration }
    const preview = await client.mutation(maintenanceFunctions.previewRetryCleanup, operationArgs)
    writeAssetCleanupRetryPreview(io, preview)
    if (!preview.allowed) return 1
    if (!preview.confirmation) {
      throw new Error('Asset cleanup retry preview did not return a confirmation token.')
    }
    const result = await client.mutation(maintenanceFunctions.retryCleanup, {
      ...operationArgs,
      _confirmationToken: preview.confirmation.token,
    })
    if (result.status !== 'applied') {
      write(
        io.stdout,
        `Asset cleanup retry ${result.status}: code=${result.code}, message=${result.message}\n`,
      )
      return 1
    }
    write(
      io.stdout,
      `Asset cleanup retry scheduled: task=${result.value.taskId}, generation=${result.value.generation}.\n`,
    )
    return 0
  }

  throw new Error('ginko-cms asset cleanup requires list or retry.')
}

function requiredValue(value: string | undefined, message: string): string {
  if (!value || value.startsWith('--')) throw new Error(message)
  return value
}

function optionalIntegerFlag(args: string[], name: string, minimum: number, maximum: number) {
  const raw = readFlag(args, name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} requires an integer from ${minimum} through ${maximum}.`)
  }
  return value
}

function writeRepairStatus(io: CliIo, status: ProjectionRepairRun) {
  write(
    io.stdout,
    `Projection/reference repair ${status.runId}: state=${status.state}, phase=${status.phase}, generation=${status.generation}, canonical-generation=${status.canonicalGeneration}, worker-generation=${status.workGeneration}, attempts=${status.workAttempts}, next-at=${status.workNextAttemptAt ?? 'none'}, lease-expires=${status.workLeaseExpiresAt ?? 'none'}, dead-lettered=${status.workDeadLetteredAt ?? 'no'}, cursor=${status.cursor ?? 'none'}, page-size=${status.pageSize}, auto=${status.autoContinue}, entries=${status.processedEntries}, drafts=${status.processedDrafts}, revisions=${status.processedRevisions}, search-inspected=${status.inspectedDraftSearchRows}, public-inspected=${status.inspectedPublicRows}, refs-inspected=${status.inspectedAssetRefs}, canonical-assets-referenced=${status.referencedAssetIds.length}, search-repaired=${status.repairedDraftSearchRows}, public-repaired=${status.repairedPublicRows}, refs-repaired=${status.repairedAssetRefSources}, orphans-deleted=${status.deletedOrphans}, issues=${status.issueCount}, completed=${status.completedAt ?? 'no'}.\n`,
  )
  if (status.workLastError) write(io.stdout, `Last repair worker error: ${status.workLastError}\n`)
  if (status.lastIssue) write(io.stdout, `Last repair issue: ${status.lastIssue}\n`)
}

function writeAssetCleanupRetryPreview(io: CliIo, preview: AssetCleanupRetryPreview) {
  write(io.stdout, `Asset cleanup retry preview: allowed=${preview.allowed}, ${preview.summary}\n`)
  for (const blocker of preview.blockers) {
    write(io.stdout, `  blocker ${blocker.code}: ${blocker.message}\n`)
  }
  for (const warning of preview.warnings) {
    write(io.stdout, `  warning ${warning.code}: ${warning.message}\n`)
  }
}

function writeRestorePreview(io: CliIo, preview: AssetRestorePreview) {
  write(
    io.stdout,
    `Asset restore preview: artifact=${preview.artifactId}, checksum=${preview.checksum}, allowed=${preview.applySupported}.\n`,
  )
  for (const blocker of preview.blockers) {
    write(io.stdout, `  blocker ${blocker.code}: ${blocker.message}\n`)
  }
  for (const warning of preview.warnings) {
    write(io.stdout, `  warning ${warning.code}: ${warning.message}\n`)
  }
}
