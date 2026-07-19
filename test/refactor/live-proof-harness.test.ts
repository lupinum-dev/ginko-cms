import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  IN_APP_BROWSER_STORY_IDS,
  LIVE_PROOF_TARGET_SCALE,
  validateCandidateArtifact,
  validateCandidateAttestation,
  validateCleanupLedger,
  validateInAppBrowserEvidence,
  validateLiveFixtureManifest,
  validateLiveProofPreflight,
} from '../../scripts/live-proof-config.mjs'

const root = resolve(import.meta.dirname, '../..')
const digest = 'a'.repeat(64)
const candidatePackageNames = [
  '@lupinum/ginko-content',
  '@lupinum/ginko-cms-contract',
  '@lupinum/ginko-cms-convex',
  '@lupinum/ginko-cms',
  'better-convex-nuxt',
]

function roleEnvironment() {
  return Object.fromEntries(
    ['VIEWER', 'EDITOR', 'PUBLISHER', 'OWNER'].flatMap((role) => [
      [
        `GINKO_CMS_TEST_${role}_EMAIL`,
        `refactor-proof-abc123-${role.toLowerCase()}@fixture.invalid`,
      ],
      [`GINKO_CMS_TEST_${role}_PASSWORD`, `${role.toLowerCase()}-password`],
    ]),
  )
}

function preflightEnvironment() {
  return {
    GINKO_CMS_DISPOSABLE_DEPLOYMENT: '1',
    GINKO_CMS_FIXTURE_PREFIX: 'refactor-proof-abc123',
    GINKO_CMS_CANDIDATE_ARTIFACT: '/tmp/candidate-artifact.json',
    GINKO_CMS_LIVE_FIXTURE_MODULE: '/tmp/live-fixture.mjs',
    CONVEX_DEPLOYMENT: 'dev:disposable-proof',
    CONVEX_URL: 'https://disposable.convex.cloud',
    CMS_STORY_BASE_URL: 'https://candidate.example.test',
    CMS_STORY_CANDIDATE_ATTESTATION_URL:
      'https://candidate.example.test/.well-known/ginko-cms-candidate.json',
    CMS_STORY_CONTRACT_MISMATCH_URL: 'https://mismatch.example.test',
    ...roleEnvironment(),
  }
}

function candidateArtifact() {
  return {
    source: { commit: 'commit-1', dirty: false },
    artifacts: Object.fromEntries(
      candidatePackageNames.map((name) => [
        name,
        { version: '1.0.0-rc.1', commit: `commit-${name}`, sha256: digest },
      ]),
    ),
  }
}

function fixtureManifest() {
  return {
    schemaVersion: 1,
    fixturePrefix: 'refactor-proof-abc123',
    targetScale: { ...LIVE_PROOF_TARGET_SCALE },
    localeCodes: ['en', 'de', 'fr'],
    probes: {
      entryPagination: {
        collection: 'scale-posts',
        query: 'refactor-proof-abc123-scale-page-',
        terminalTitle: 'refactor-proof-abc123 Scale page 1205',
        expectedRows: 1205,
      },
      deepSearch: {
        collection: 'scale-posts',
        query: 'refactor-proof-abc123-deep-terminal',
        expectedTitle: 'refactor-proof-abc123 Scale page 1205',
      },
      assetSearch: {
        query: 'refactor-proof-abc123-asset-500',
        expectedFilename: 'refactor-proof-abc123-asset-500.png',
      },
      roleEntry: {
        path: '/studio/content/scale-posts/refactor-proof-abc123-entry-1',
        title: 'refactor-proof-abc123 Role probe',
        bodyBytes: LIVE_PROOF_TARGET_SCALE.longMdcBytes,
      },
      routeRedirect: {
        sourcePath: '/refactor-proof-abc123/old/tree/page',
        targetPath: '/refactor-proof-abc123/new/tree/page',
      },
      pendingReview: {
        title: 'refactor-proof-abc123 Atomic EN/DE review',
        localeCodes: ['en', 'de'],
        publicPaths: {
          en: '/posts/refactor-proof-abc123-atomic',
          de: '/de/posts/refactor-proof-abc123-atomar',
        },
      },
      mcpReview: {
        entryId: 'entry-mcp',
        locale: 'en',
        reviewTitle: 'refactor-proof-abc123 MCP review',
        expectedVersion: 7,
      },
      publicRoutes: {
        deepestPath: '/refactor-proof-abc123-scale/a/b/c/d/e',
        expectedRows: 4500,
        pathPrefixes: [
          '/refactor-proof-abc123-scale/',
          '/de/refactor-proof-abc123-scale/',
          '/fr/refactor-proof-abc123-scale/',
        ],
      },
      contractMismatchUrl: 'https://mismatch.example.test/studio/model',
    },
  }
}

function inAppBrowserEvidence() {
  return {
    schemaVersion: 1,
    commit: 'commit-1',
    candidateArtifactSha256: digest,
    fixturePrefix: 'refactor-proof-abc123',
    browserOrigin: 'https://candidate.example.test',
    startedAt: '2026-07-17T10:00:00.000Z',
    finishedAt: '2026-07-17T10:30:00.000Z',
    journeys: IN_APP_BROWSER_STORY_IDS.map((id) => ({ id, status: 'passed' })),
    viewports: [{ name: 'desktop' }, { name: 'tablet' }, { name: 'narrow' }],
    accessibility: {
      keyboard: true,
      reducedMotion: true,
      seriousViolations: 0,
      criticalViolations: 0,
      horizontalOverflow: 0,
    },
    observability: { consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, failedRequests: 0 },
    credentialHandling: { typedInteractively: true, persisted: false, captured: false },
    screenshots: ['browser/desktop.png', 'browser/tablet.png', 'browser/narrow.png'],
  }
}

describe('live refactor proof contract', () => {
  it('requires unique disposable role accounts and exact same-origin candidate attestation', () => {
    expect(
      validateLiveProofPreflight(preflightEnvironment(), { existsSync: () => true }),
    ).toMatchObject({
      fixturePrefix: 'refactor-proof-abc123',
      baseUrl: 'https://candidate.example.test',
      roles: {
        viewer: { email: 'refactor-proof-abc123-viewer@fixture.invalid' },
        owner: { email: 'refactor-proof-abc123-owner@fixture.invalid' },
      },
    })

    expect(() =>
      validateLiveProofPreflight(
        { ...preflightEnvironment(), GINKO_CMS_TEST_EMAIL: 'legacy@example.test' },
        { existsSync: () => true },
      ),
    ).toThrow(/rejects legacy single-account/i)
    expect(() =>
      validateLiveProofPreflight(
        {
          ...preflightEnvironment(),
          GINKO_CMS_TEST_EDITOR_EMAIL: 'refactor-proof-abc123-viewer@fixture.invalid',
        },
        { existsSync: () => true },
      ),
    ).toThrow(/different disposable account/i)
    expect(() =>
      validateLiveProofPreflight(
        {
          ...preflightEnvironment(),
          CMS_STORY_CANDIDATE_ATTESTATION_URL:
            'https://unrelated.example.test/.well-known/ginko-cms-candidate.json',
        },
        { existsSync: () => true },
      ),
    ).toThrow(/exact browser-tested consumer origin/i)
  })

  it('matches the remote Browser target to every packed candidate artifact', () => {
    const candidate = validateCandidateArtifact(candidateArtifact())
    const attestation = {
      schemaVersion: 1,
      sourceCommit: candidate.commit,
      packages: candidate.packages,
    }
    expect(validateCandidateAttestation(attestation, candidate)).toEqual({
      sourceCommit: 'commit-1',
      packages: candidate.packages,
    })
    expect(() =>
      validateCandidateAttestation(
        {
          ...attestation,
          packages: {
            ...attestation.packages,
            '@lupinum/ginko-cms': {
              ...attestation.packages['@lupinum/ginko-cms'],
              sha256: 'b'.repeat(64),
            },
          },
        },
        candidate,
      ),
    ).toThrow(/does not match @lupinum\/ginko-cms/i)
  })

  it('[QUA-02][QUA-08] accepts in-app Browser proof only for the exact candidate with every green journey', () => {
    const expected = {
      commit: 'commit-1',
      candidateArtifactSha256: digest,
      fixturePrefix: 'refactor-proof-abc123',
      browserOrigin: 'https://candidate.example.test',
    }
    expect(validateInAppBrowserEvidence(inAppBrowserEvidence(), expected)).toMatchObject({
      commit: 'commit-1',
      journeys: expect.arrayContaining([
        expect.objectContaining({ id: 'mcp.key-review-approval-revocation-401' }),
      ]),
      credentialHandling: { typedInteractively: true, persisted: false, captured: false },
    })
    expect(() =>
      validateInAppBrowserEvidence(
        { ...inAppBrowserEvidence(), journeys: inAppBrowserEvidence().journeys.slice(1) },
        expected,
      ),
    ).toThrow(/missing journeys/i)
    expect(() =>
      validateInAppBrowserEvidence(
        {
          ...inAppBrowserEvidence(),
          observability: { ...inAppBrowserEvidence().observability, consoleWarnings: 1 },
        },
        expected,
      ),
    ).toThrow(/consoleWarnings/i)
    expect(() =>
      validateInAppBrowserEvidence(
        {
          ...inAppBrowserEvidence(),
          credentialHandling: { typedInteractively: true, persisted: true, captured: false },
        },
        expected,
      ),
    ).toThrow(/credential handling/i)
  })

  it('accepts only the exact target-scale probes and EN/DE publish-all evidence', () => {
    expect(validateLiveFixtureManifest(fixtureManifest(), 'refactor-proof-abc123')).toMatchObject({
      targetScale: LIVE_PROOF_TARGET_SCALE,
      probes: {
        entryPagination: { expectedRows: 1205 },
        publicRoutes: { expectedRows: 4500 },
        pendingReview: { localeCodes: ['en', 'de'] },
      },
    })
    const inflated = fixtureManifest()
    inflated.targetScale.entries = 100_000
    expect(() => validateLiveFixtureManifest(inflated, 'refactor-proof-abc123')).toThrow(
      /must be exactly 1500/i,
    )
    const singleLocaleReview = fixtureManifest()
    singleLocaleReview.probes.pendingReview.localeCodes = ['en']
    expect(() => validateLiveFixtureManifest(singleLocaleReview, 'refactor-proof-abc123')).toThrow(
      /atomically publish exactly en and de/i,
    )
    const unisolated = fixtureManifest()
    unisolated.probes.deepSearch.query = 'shared-deployment-row'
    expect(() => validateLiveFixtureManifest(unisolated, 'refactor-proof-abc123')).toThrow(
      /unique fixture prefix/i,
    )
  })

  it('rejects cleanup claims while disposable fixture records remain', () => {
    const complete = {
      schemaVersion: 1,
      fixturePrefix: 'refactor-proof-abc123',
      deploymentDiscarded: false,
      remaining: {
        entries: 0,
        assets: 0,
        reviews: 0,
        redirects: 0,
        siteData: 0,
        mcpConnections: 0,
        members: 0,
      },
    }
    expect(validateCleanupLedger(complete, 'refactor-proof-abc123')).toMatchObject({
      fullyCleaned: true,
    })
    expect(() =>
      validateCleanupLedger(
        { ...complete, remaining: { ...complete.remaining, assets: 1 } },
        'refactor-proof-abc123',
      ),
    ).toThrow(/neither discarded nor fully cleaned/i)
  })

  it('[QUA-07] keeps live certification fail-closed and based on measured repeated samples', async () => {
    const [
      runner,
      fixtureDriver,
      smoke,
      performance,
      roles,
      observability,
      mcp,
      studio,
      publicProof,
      siteData,
      packedHost,
      accountProvisioner,
    ] = await Promise.all([
      readFile(resolve(root, 'scripts/refactor-proof.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/consumer-live-fixtures.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/cms-live-story-smoke.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/performance-proof.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/role-journeys.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/browser-observability.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/mcp-proof.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/studio-journeys.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/public-journeys.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/site-data-proof.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/package-e2e.mjs'), 'utf8'),
      readFile(resolve(root, 'scripts/live-proof/provision-accounts.mjs'), 'utf8'),
    ])
    expect(runner).toContain('validateLiveProofPreflight()')
    expect(runner).toContain("'seed disposable target-scale fixtures'")
    expect(runner).toContain('isolatedProofEnvironment(commandEnv)')
    expect(runner).toContain('isolated: true')
    expect(runner).toContain("'provision disposable role accounts'")
    expect(runner).toContain("'clean disposable target-scale fixtures'")
    expect(runner).toContain("status: 'retained-for-in-app-browser'")
    expect(runner).toContain('validateInAppBrowserEvidence')
    expect(runner).toContain('validateCleanupLedger')
    expect(runner).toContain('journeyCleanup?.siteDataDeleted === true')
    expect(runner).toContain("status: browserGreen ? 'automated-green-in-app-browser-pending'")
    expect(fixtureDriver).toContain("'liveFixtures:setupEntriesPage'")
    expect(fixtureDriver).toContain("'liveFixtures:setupAssetsPage'")
    expect(fixtureDriver).toContain("'liveFixtures/cleanup:cleanupEntriesPage'")
    expect(fixtureDriver).toContain("'liveFixtures/cleanup:cleanupAssetsPage'")
    expect(fixtureDriver).toContain("'GINKO_CMS_LIVE_FIXTURES'")
    expect(smoke).toContain("'candidate.exact-packed-consumer'")
    expect(smoke).toContain('validateCandidateAttestation')
    expect(smoke).toContain('performanceSampleCount < 20')
    expect(smoke).toContain('await runRoleJourneys({')
    expect(smoke).toContain('await mcpProof.runStories()')
    expect(smoke).toContain('await performanceProof.runJourney({')
    expect(performance).toContain('[data-testid="cms-richtext-editor"]')
    expect(performance).toContain('fixtureManifest.probes.roleEntry.bodyBytes')
    expect(studio).toContain("'scale.entry-pagination-1205'")
    expect(publicProof).toContain("'scale.public-routes-target-fixture'")
    expect(siteData).toContain("'site-data.localized-public-lifecycle'")
    expect(siteData).toContain('/api/_content/site-data?key=')
    expect(packedHost).toContain(`modules: ['@nuxtjs/sitemap', '@lupinum/ginko-content', ginkoCms]`)
    expect(packedHost).toContain("i18n: { defaultLocale: 'en'")
    expect(packedHost).toContain('site: { url: process.env.CMS_STORY_SITE_URL')
    expect(packedHost).toContain("liveConvex ? 'app/pages' : 'pages'")
    expect(accountProvisioner).toContain('origin: baseUrl')
    expect(accountProvisioner).toContain('response.status !== 429')
    expect(accountProvisioner).toContain('1_000 * 2 ** attempt')
    for (const metric of [
      'studioColdInteractive',
      'primaryNavigation',
      'searchFilter',
      'listPaging',
      'longEditorKeystroke',
      'publishPreview',
      'interactionToNextPaint',
      'cumulativeLayoutShift',
    ]) {
      expect(performance).toMatch(new RegExp(`recordPerformanceMetric\\(\\s*'${metric}'`))
    }
    expect(roles).toContain("viewer: LIVE_PROOF_VIEWPORTS.find(({ name }) => name === 'narrow')")
    expect(roles).toContain(
      "publisher: LIVE_PROOF_VIEWPORTS.find(({ name }) => name === 'desktop')",
    )
    expect(observability).toContain("if (!['warning', 'error'].includes(message.type())) return")
    expect(mcp).toContain("'request-publish-review'")

    const lineCounts = Object.fromEntries(
      Object.entries({
        smoke,
        performance,
        roles,
        observability,
        mcp,
        studio,
        publicProof,
        siteData,
      }).map(([name, source]) => [name, source.trimEnd().split('\n').length]),
    )
    expect(lineCounts).toMatchObject({
      smoke: expect.any(Number),
      performance: expect.any(Number),
      roles: expect.any(Number),
      observability: expect.any(Number),
      mcp: expect.any(Number),
      studio: expect.any(Number),
      publicProof: expect.any(Number),
      siteData: expect.any(Number),
    })
    expect(lineCounts.smoke).toBeLessThanOrEqual(800)
    expect(lineCounts.performance).toBeLessThanOrEqual(220)
    expect(lineCounts.roles).toBeLessThanOrEqual(200)
    expect(lineCounts.observability).toBeLessThanOrEqual(180)
    expect(lineCounts.mcp).toBeLessThanOrEqual(450)
    expect(lineCounts.studio).toBeLessThanOrEqual(450)
    expect(lineCounts.publicProof).toBeLessThanOrEqual(250)
    expect(lineCounts.siteData).toBeLessThanOrEqual(180)
  })
})
