import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const defaultRepoRoot = resolve(import.meta.dirname, '..')

function capture(repoRoot, command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function requiredDigest(message, name) {
  const matches = [...message.matchAll(new RegExp(`^${name}: ([a-f0-9]{64})$`, 'gimu'))]
  if (matches.length !== 1) {
    throw new Error(`Annotated release tag must contain exactly one ${name} line.`)
  }
  return matches[0][1].toLowerCase()
}

export function parseCandidateApprovalMessage(message) {
  return {
    candidateArtifactSha256: requiredDigest(message, 'candidate-artifact-sha256'),
    liveProofSha256: requiredDigest(message, 'live-proof-sha256'),
  }
}

export function verifyCandidateApproval({
  repoRoot = defaultRepoRoot,
  candidatePath = resolve(repoRoot, '.pack/candidate/candidate-artifact.json'),
  tagName = process.env.GITHUB_REF_NAME,
} = {}) {
  if (!tagName || !/^v\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/u.test(tagName)) {
    throw new Error('Candidate approval requires a prerelease tag name.')
  }
  if (!existsSync(candidatePath)) throw new Error('Candidate artifact evidence is missing.')

  const tagRef = `refs/tags/${tagName}`
  if (capture(repoRoot, 'git', ['cat-file', '-t', tagRef]) !== 'tag') {
    throw new Error(`${tagName} must be an annotated tag that binds the approved proof hashes.`)
  }
  const approval = parseCandidateApprovalMessage(
    capture(repoRoot, 'git', ['for-each-ref', '--format=%(contents)', tagRef]),
  )
  const candidateBytes = readFileSync(candidatePath)
  const candidateArtifactSha256 = createHash('sha256').update(candidateBytes).digest('hex')
  if (candidateArtifactSha256 !== approval.candidateArtifactSha256) {
    throw new Error('Tag-approved candidate artifact hash does not match the generated candidate.')
  }

  const candidate = JSON.parse(candidateBytes)
  const sourceCommit = capture(repoRoot, 'git', ['rev-parse', `${tagRef}^{commit}`])
  const headCommit = capture(repoRoot, 'git', ['rev-parse', 'HEAD'])
  if (sourceCommit !== headCommit || candidate.source?.commit !== sourceCommit) {
    throw new Error('Tag, checkout, and candidate artifact do not identify the same source commit.')
  }

  return {
    schemaVersion: 1,
    tag: tagName,
    tagObject: capture(repoRoot, 'git', ['rev-parse', tagRef]),
    sourceCommit,
    candidateArtifactSha256,
    liveProofSha256: approval.liveProofSha256,
    approvedBy: capture(repoRoot, 'git', [
      'for-each-ref',
      '--format=%(taggername) %(taggeremail)',
      tagRef,
    ]),
  }
}

function main() {
  const evidence = verifyCandidateApproval()
  const outputPath = resolve(defaultRepoRoot, '.pack/candidate/release-approval.json')
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(
    `${evidence.tag} approves candidate ${evidence.candidateArtifactSha256} with live proof ${evidence.liveProofSha256}.`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
