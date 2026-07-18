import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runGinkoCmsCli } from '../../packages/cms/src/cli/ginko-cms.js'
import { loadContentConfig } from '../../packages/cms/src/cli/push.js'
import { loadGinkoContentContract } from '../../packages/cms/src/module/content-contract.js'
import { writeExpectedContractBinding } from '../../packages/cms/src/module/convex.js'

const functionName = Symbol.for('functionName')
const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function output() {
  let value = ''
  return {
    stream: { write: (chunk: string | Uint8Array) => void (value += String(chunk)) },
    read: () => value,
  }
}

function pathOf(reference: unknown) {
  return String((reference as Record<symbol, unknown>)[functionName])
}

function repairStatus(state: 'running' | 'complete' | 'failed' | 'dead' = 'running') {
  return {
    runId: 'repair-proof-1',
    state,
    phase: 'publicRows' as const,
    cursor: 'public-row-25',
    generation: 3,
    canonicalGeneration: 11,
    workGeneration: 8,
    workToken: state === 'running' ? 'internal-worker-token' : null,
    workLeaseExpiresAt: state === 'running' ? 500 : null,
    workAttempts: state === 'dead' ? 3 : 0,
    workNextAttemptAt: null,
    workLastError: state === 'dead' ? 'Projection repair worker lease expired.' : null,
    workDeadLetteredAt: state === 'dead' ? 450 : null,
    pageSize: 17,
    autoContinue: false,
    processedEntries: 25,
    processedDrafts: 31,
    processedRevisions: 42,
    inspectedDraftSearchRows: 50,
    inspectedPublicRows: 25,
    inspectedAssetRefs: 10,
    referencedAssetIds: ['asset-1'],
    repairedPublicRows: 2,
    repairedDraftSearchRows: 3,
    repairedAssetRefSources: 4,
    deletedOrphans: 1,
    issueCount: 0,
    lastIssue: null,
    createdBy: 'owner-1',
    createdAt: 100,
    updatedAt: 200,
    completedAt: state === 'complete' ? 200 : null,
  }
}

describe('ginko-cms owner maintenance CLI', () => {
  it('uses owner-session guards for repair, exact-byte recovery, and deployment doctor', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-cms-maintenance-cli-'))
    temporaryDirectories.push(root)
    const init = await runGinkoCmsCli(['init'], { cwd: root })
    expect(init).toBe(0)
    writeFileSync(
      resolve(root, 'content.config.ts'),
      `export default { provider: 'cms', collections: { posts: { type: 'page', source: 'content/posts/**/*.md', route: '/posts', fields: { title: { type: 'text', required: true } } } } }\n`,
      'utf8',
    )
    writeFileSync(resolve(root, 'nuxt.config.ts'), 'export default { content: {} }\n', 'utf8')
    writeFileSync(
      resolve(root, '.env.local'),
      [
        'CONVEX_URL=https://example.convex.cloud',
        'CONVEX_SITE_URL=https://example.convex.site',
        'GINKO_CMS_SESSION_COOKIE=better-auth.session_token=owner-session-token',
        'BETTER_AUTH_SECRET=test-better-auth-secret',
        '',
      ].join('\n'),
      'utf8',
    )

    const archiveJson = '{"format":"ginko-cms-asset-recovery","version":1}'
    const artifactChecksum = createHash('sha256').update(archiveJson).digest('hex')
    const config = await loadContentConfig(root)
    const expectedContent = await loadGinkoContentContract({
      rootDir: root,
      content: config.content,
    })
    const expectedContentHash = await hashCanonicalJson(expectedContent)
    const expectedPresentationHash = await hashCanonicalJson(config.presentation)
    writeExpectedContractBinding(root, {
      contentHash: expectedContentHash,
      presentationHash: expectedPresentationHash,
    })
    let restoreBlocked = false
    let contractMatches = true
    let repairRunState: 'running' | 'dead' = 'running'
    let terminalCleanupTasks = [
      {
        taskId: 'cleanup-task-1',
        storageId: 'storage-orphan-1',
        uploadSessionId: 'upload-session-1',
        generation: 4,
        attempts: 5,
        lastError: 'storage service unavailable',
        createdAt: 100,
        updatedAt: 200,
      },
    ]
    const calls: Array<{ kind: string; path: string; args: Record<string, unknown> }> = []
    const client = {
      setAuth: vi.fn(),
      query: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ kind: 'query', path, args })
        if (path.endsWith(':getProjectionRepairRun')) return repairStatus(repairRunState)
        if (path.endsWith(':listTerminalAssetCleanupTasks')) {
          return { page: terminalCleanupTasks, isDone: true, continueCursor: '' }
        }
        if (path.endsWith(':getAccessContext')) {
          return {
            userId: 'owner-1',
            role: 'owner',
            can: {
              'cms.portability.manage': true,
              'cms.assetRecovery.manage': true,
            },
          }
        }
        if (path.endsWith(':getInstalledContractStatus')) {
          return {
            installedContentHash: contractMatches ? expectedContentHash : '0'.repeat(64),
            installedPresentationHash: expectedPresentationHash,
            transitionState: 'ready',
            transitionRunId: null,
          }
        }
        throw new Error(`Unexpected query ${path}`)
      },
      mutation: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ kind: 'mutation', path, args })
        if (path.endsWith(':startProjectionRepairRun')) return repairStatus()
        if (path.endsWith(':resumeProjectionRepairRun')) {
          return { ...repairStatus(), generation: 4 }
        }
        if (path.endsWith(':previewRetryAssetCleanupOperation')) {
          return {
            allowed: true,
            summary: 'Will resume one terminal asset-storage cleanup.',
            blockers: [],
            warnings: [
              {
                code: 'asset-cleanup-byte-delete',
                message: 'The worker will delete unclaimed storage bytes.',
              },
            ],
            confirmation: { token: 'cleanup-confirmation-1', expiresAt: 500 },
          }
        }
        if (path.endsWith(':retryAssetCleanupOperationExecute')) {
          terminalCleanupTasks = []
          return {
            status: 'applied',
            value: { taskId: 'cleanup-task-1', generation: 5 },
          }
        }
        throw new Error(`Unexpected mutation ${path}`)
      },
      action: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ kind: 'action', path, args })
        if (path.endsWith(':createAssetRecoveryArtifact')) {
          return {
            artifactId: 'artifact-1',
            assetId: 'asset-1',
            checksum: artifactChecksum,
            storageRef: 'storage-1',
          }
        }
        if (path.endsWith(':downloadAssetRecoveryArtifact')) {
          return { artifactId: 'artifact-1', checksum: artifactChecksum, archiveJson }
        }
        if (path.endsWith(':verifyAssetRecoveryArtifact')) {
          return {
            artifactId: 'artifact-1',
            ok: true,
            checksumMatches: true,
            currentDataMatches: true,
          }
        }
        if (path.endsWith(':previewRestoreAsset')) {
          return {
            artifactId: 'artifact-1',
            checksum: artifactChecksum,
            applySupported: !restoreBlocked,
            blockers: restoreBlocked
              ? [{ code: 'restore-target-exists', message: 'The asset still exists.' }]
              : [],
            warnings: [],
          }
        }
        if (path.endsWith(':restoreAsset')) {
          return {
            artifactId: 'artifact-1',
            originalAssetId: 'asset-1',
            restoredAssetId: 'asset-restored-1',
          }
        }
        throw new Error(`Unexpected action ${path}`)
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ token: 'operator-convex-jwt' }), {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )

    const run = async (args: string[]) => {
      const stdout = output()
      const stderr = output()
      const code = await runGinkoCmsCli(args, {
        cwd: root,
        io: { stdout: stdout.stream, stderr: stderr.stream },
        convexClientFactory: () => client as never,
      })
      return { code, stdout: stdout.read(), stderr: stderr.read() }
    }

    const started = await run([
      'repair',
      'start',
      'repair-proof-1',
      '--page-size',
      '17',
      '--manual',
    ])
    expect(started).toMatchObject({ code: 0, stderr: '' })
    expect(started.stdout).toContain('Projection/reference repair started')
    expect(started.stdout).toContain('refs-repaired=4')
    expect(calls.at(-1)).toMatchObject({
      kind: 'mutation',
      path: expect.stringMatching(/:startProjectionRepairRun$/),
      args: { runId: 'repair-proof-1', pageSize: 17, autoContinue: false },
    })

    const status = await run(['repair', 'status', 'repair-proof-1'])
    expect(status).toMatchObject({ code: 0, stderr: '' })
    expect(status.stdout).toContain('phase=publicRows, generation=3')

    repairRunState = 'dead'
    const deadLetter = await run(['repair', 'status', 'repair-proof-1'])
    expect(deadLetter).toMatchObject({ code: 1, stderr: '' })
    expect(deadLetter.stdout).toContain('state=dead')
    expect(deadLetter.stdout).toContain('attempts=3')
    expect(deadLetter.stdout).toContain('dead-lettered=450')
    expect(deadLetter.stdout).toContain('Last repair worker error')
    repairRunState = 'running'

    const resumed = await run(['repair', 'resume', 'repair-proof-1'])
    expect(resumed).toMatchObject({ code: 0, stderr: '' })
    expect(resumed.stdout).toContain('generation=4')

    const cleanupInventory = await run(['asset', 'cleanup', 'list'])
    expect(cleanupInventory).toMatchObject({ code: 0, stderr: '' })
    expect(cleanupInventory.stdout).toContain('task=cleanup-task-1, generation=4, attempts=5')

    const terminalCleanupDoctor = await run(['doctor', '--deployment'])
    expect(terminalCleanupDoctor.code).toBe(1)
    expect(terminalCleanupDoctor.stderr).toContain(
      'terminal asset cleanup failure(s) require attention',
    )

    const cleanupRetried = await run([
      'asset',
      'cleanup',
      'retry',
      'cleanup-task-1',
      '--generation',
      '4',
      '--yes',
    ])
    expect(cleanupRetried).toMatchObject({ code: 0, stderr: '' })
    expect(cleanupRetried.stdout).toContain(
      'Asset cleanup retry scheduled: task=cleanup-task-1, generation=5',
    )
    expect(calls.slice(-2)).toEqual([
      expect.objectContaining({
        kind: 'mutation',
        path: expect.stringMatching(/:previewRetryAssetCleanupOperation$/),
        args: { taskId: 'cleanup-task-1', expectedGeneration: 4 },
      }),
      expect.objectContaining({
        kind: 'mutation',
        path: expect.stringMatching(/:retryAssetCleanupOperationExecute$/),
        args: {
          taskId: 'cleanup-task-1',
          expectedGeneration: 4,
          _confirmationToken: 'cleanup-confirmation-1',
        },
      }),
    ])

    const created = await run(['asset', 'recovery', 'create', 'asset-1'])
    expect(created).toMatchObject({ code: 0, stderr: '' })
    expect(created.stdout).toContain(`artifact=artifact-1, asset=asset-1`)

    const downloadPath = resolve(root, 'asset-recovery.json')
    const downloaded = await run([
      'asset',
      'recovery',
      'download',
      'artifact-1',
      '--out',
      downloadPath,
    ])
    expect(downloaded).toMatchObject({ code: 0, stderr: '' })
    expect(readFileSync(downloadPath, 'utf8')).toBe(archiveJson)
    expect(downloaded.stdout).toContain(`checksum=${artifactChecksum}`)

    const verified = await run(['asset', 'recovery', 'verify', 'artifact-1'])
    expect(verified).toMatchObject({ code: 0, stderr: '' })
    expect(verified.stdout).toContain('ok=true, checksum=true, current-data=true')

    const previewed = await run(['asset', 'recovery', 'preview', 'artifact-1'])
    expect(previewed).toMatchObject({ code: 0, stderr: '' })
    expect(previewed.stdout).toContain('allowed=true')

    const restoreWithoutConfirmation = await run([
      'asset',
      'recovery',
      'restore',
      'artifact-1',
      '--checksum',
      artifactChecksum,
    ])
    expect(restoreWithoutConfirmation.code).toBe(2)
    expect(restoreWithoutConfirmation.stderr).toContain('requires --yes after reviewing preview')

    const restored = await run([
      'asset',
      'recovery',
      'restore',
      'artifact-1',
      '--checksum',
      artifactChecksum,
      '--yes',
    ])
    expect(restored).toMatchObject({ code: 0, stderr: '' })
    expect(restored.stdout).toContain('restored=asset-restored-1')
    const restoreCalls = calls.filter(
      (call) => call.path.endsWith(':previewRestoreAsset') || call.path.endsWith(':restoreAsset'),
    )
    expect(restoreCalls.slice(-2).map((call) => call.path.split(':').at(-1))).toEqual([
      'previewRestoreAsset',
      'restoreAsset',
    ])
    expect(restoreCalls.at(-1)?.args).toEqual({
      artifactId: 'artifact-1',
      expectedChecksum: artifactChecksum,
    })

    restoreBlocked = true
    const callsBeforeBlockedRestore = calls.length
    const blocked = await run([
      'asset',
      'recovery',
      'restore',
      'artifact-1',
      '--checksum',
      artifactChecksum,
      '--yes',
    ])
    expect(blocked).toMatchObject({ code: 1, stderr: '' })
    expect(blocked.stdout).toContain('blocker restore-target-exists')
    expect(calls.slice(callsBeforeBlockedRestore).map((call) => call.path)).toEqual([
      expect.stringMatching(/:previewRestoreAsset$/),
    ])

    const doctor = await run(['doctor', '--deployment'])
    expect(doctor).toMatchObject({ code: 0, stderr: '' })
    expect(doctor.stdout).toContain(
      'deployment doctor passed: backend reachable, owner session authenticated, host contract hashes and transition state ready',
    )
    expect(doctor.stdout).toContain('Ginko CMS doctor passed')
    expect(client.setAuth).toHaveBeenCalled()

    contractMatches = false
    const driftedDoctor = await run(['doctor', '--deployment'])
    expect(driftedDoctor.code).toBe(1)
    expect(driftedDoctor.stderr).toContain(
      'installed content contract hash does not match content.config.ts',
    )
  })

  it('refuses a corrupt download receipt before writing a recovery file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-cms-maintenance-download-'))
    temporaryDirectories.push(root)
    writeFileSync(
      resolve(root, '.env.local'),
      [
        'CONVEX_URL=https://example.convex.cloud',
        'CONVEX_SITE_URL=https://example.convex.site',
        'GINKO_CMS_SESSION_COOKIE=better-auth.session_token=owner-session-token',
        '',
      ].join('\n'),
      'utf8',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ token: 'operator-convex-jwt' }), {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const outputPath = resolve(root, 'must-not-exist.json')
    const stdout = output()
    const stderr = output()
    const code = await runGinkoCmsCli(
      ['asset', 'recovery', 'download', 'artifact-corrupt', '--out', outputPath],
      {
        cwd: root,
        io: { stdout: stdout.stream, stderr: stderr.stream },
        convexClientFactory: () =>
          ({
            setAuth: () => {},
            action: async () => ({
              artifactId: 'artifact-corrupt',
              checksum: '0'.repeat(64),
              archiveJson: '{"tampered":true}',
            }),
          }) as never,
      },
    )

    expect(code).toBe(2)
    expect(stderr.read()).toContain('checksum does not match the artifact receipt')
    expect(existsSync(outputPath)).toBe(false)
  })
})
