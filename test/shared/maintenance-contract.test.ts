import {
  createAssetRecoveryArtifact,
  downloadAssetRecoveryArtifact,
  getProjectionRepairRun,
  listTerminalAssetCleanupTasks,
  previewRetryAssetCleanupOperation,
  previewRestoreAsset,
  restoreAsset,
  resumeProjectionRepairRun,
  retryAssetCleanupOperationExecute,
  startProjectionRepairRun,
  verifyAssetRecoveryArtifact,
} from '@lupinum/ginko-cms-contract/convex/schemas/maintenance.js'
import { describe, expect, it } from 'vitest'

function fields(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  return ((value as { fields?: Record<string, unknown> }).fields ?? value) as Record<
    string,
    unknown
  >
}

describe('owner maintenance contracts', () => {
  it('keeps one bounded projection/reference repair protocol', () => {
    expect(Object.keys(fields(startProjectionRepairRun.args)).sort()).toEqual([
      'autoContinue',
      'pageSize',
      'runId',
    ])
    expect(Object.keys(fields(resumeProjectionRepairRun.args)).sort()).toEqual([
      'autoContinue',
      'runId',
    ])
    expect(Object.keys(fields(getProjectionRepairRun.args))).toEqual(['runId'])
    expect(startProjectionRepairRun.description).toMatch(/public\/search projections.*references/i)
  })

  it('exposes recovery without an unguarded delete or purge contract', () => {
    for (const schema of [
      downloadAssetRecoveryArtifact,
      verifyAssetRecoveryArtifact,
      previewRestoreAsset,
    ]) {
      expect(Object.keys(fields(schema.args))).toEqual(['artifactId'])
    }
    expect(Object.keys(fields(createAssetRecoveryArtifact.args))).toEqual(['assetId'])
    expect(Object.keys(fields(restoreAsset.args)).sort()).toEqual([
      'artifactId',
      'expectedChecksum',
    ])
  })

  it('exposes only paginated inventory and guarded retry for terminal upload cleanup', () => {
    expect(Object.keys(fields(listTerminalAssetCleanupTasks.args))).toEqual(['paginationOpts'])
    expect(Object.keys(fields(previewRetryAssetCleanupOperation.args)).sort()).toEqual([
      'expectedGeneration',
      'taskId',
    ])
    expect(Object.keys(fields(retryAssetCleanupOperationExecute.args)).sort()).toEqual([
      '_confirmationToken',
      'expectedGeneration',
      'taskId',
    ])
  })
})
