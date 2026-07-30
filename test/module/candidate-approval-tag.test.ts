import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  parseCandidateApprovalMessage,
  verifyCandidateApproval,
} from '../../scripts/verify-candidate-approval-tag.mjs'

const candidateDigest = 'a'.repeat(64)
const proofDigest = 'b'.repeat(64)

describe('candidate approval tag', () => {
  it('binds one exact candidate artifact and one exact live proof', () => {
    expect(
      parseCandidateApprovalMessage(
        `Ginko RC.2 approval\n\ncandidate-artifact-sha256: ${candidateDigest}\nlive-proof-sha256: ${proofDigest}\n`,
      ),
    ).toEqual({
      candidateArtifactSha256: candidateDigest,
      liveProofSha256: proofDigest,
    })
  })

  it('rejects missing or ambiguous proof bindings', () => {
    expect(() =>
      parseCandidateApprovalMessage(`candidate-artifact-sha256: ${candidateDigest}\n`),
    ).toThrow(/live-proof-sha256/u)
    expect(() =>
      parseCandidateApprovalMessage(
        `candidate-artifact-sha256: ${candidateDigest}\ncandidate-artifact-sha256: ${candidateDigest}\nlive-proof-sha256: ${proofDigest}\n`,
      ),
    ).toThrow(/candidate-artifact-sha256/u)
  })

  it('verifies an annotated tag against the exact candidate bytes and source commit', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'ginko-candidate-approval-'))
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
    try {
      git('init', '--quiet')
      git('config', 'user.name', 'Release Tester')
      git('config', 'user.email', 'release@example.com')
      writeFileSync(resolve(root, 'source.txt'), 'candidate source\n')
      git('add', 'source.txt')
      git('commit', '--quiet', '-m', 'candidate')
      const sourceCommit = git('rev-parse', 'HEAD')
      const candidatePath = resolve(root, 'candidate-artifact.json')
      writeFileSync(
        candidatePath,
        `${JSON.stringify({ source: { commit: sourceCommit, dirty: false } }, null, 2)}\n`,
      )
      const candidateArtifactSha256 = createHash('sha256')
        .update(readFileSync(candidatePath))
        .digest('hex')
      git(
        'tag',
        '-a',
        'v0.2.0-rc.2',
        '-m',
        `Ginko RC.2 approval\n\ncandidate-artifact-sha256: ${candidateArtifactSha256}\nlive-proof-sha256: ${proofDigest}`,
      )

      expect(
        verifyCandidateApproval({
          repoRoot: root,
          candidatePath,
          tagName: 'v0.2.0-rc.2',
        }),
      ).toMatchObject({
        schemaVersion: 1,
        sourceCommit,
        candidateArtifactSha256,
        liveProofSha256: proofDigest,
        approvedBy: 'Release Tester <release@example.com>',
      })

      git('tag', 'v0.2.0-rc.3')
      expect(() =>
        verifyCandidateApproval({
          repoRoot: root,
          candidatePath,
          tagName: 'v0.2.0-rc.3',
        }),
      ).toThrow(/annotated tag/u)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
