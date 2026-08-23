import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { verifyPublicImageBytes } from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { createLiveCandidateServerEnvironment } from '../../scripts/live-candidate-environment.mjs'
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
import { describeSanitizedAuthFailure } from '../../scripts/live-proof/auth-failure.mjs'

const root = resolve(import.meta.dirname, '../..')
const digest = 'a'.repeat(64)
const candidatePackageNames = [
  '@lupinum/ginko-content',
  '@lupinum/ginko-cms-contract',
  '@lupinum/ginko-cms-convex',
  '@lupinum/ginko-cms',
  '@lupinum/better-convex-nuxt',
]
const liveUploadPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

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
    CONVEX_DEPLOY_KEY: 'dev:disposable-proof|fixture-key',
    CMS_STORY_BASE_URL: 'https://candidate.example.test',
    CMS_STORY_CANDIDATE_ATTESTATION_URL:
      'https://candidate.example.test/.well-known/ginko-cms-candidate.json',
    CMS_STORY_CONTRACT_MISMATCH_URL: 'https://mismatch.example.test',
    BCN_AUTH_TRUSTED_CLIENT_IP_HEADER: 'x-forwarded-for',
    BCN_AUTH_PROXY_IP_SECRET: 'fixture-proxy-secret',
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
    journeyBaseline: {
      assets: LIVE_PROOF_TARGET_SCALE.assets - 1,
      reservedUploadSlots: 1,
    },
    localeCodes: ['en', 'de', 'fr'],
    probes: {
      entryPagination: {
        collection: 'scale-posts',
        workState: 'changed',
        terminalTitle: 'refactor-proof-abc123 Scale page 1205',
        expectedRows: 1205,
      },
      deepSearch: {
        collection: 'scale-posts',
        query: 'review terminal',
        expectedTitle: 'refactor-proof-abc123 review terminal',
      },
      assetSearch: {
        query: '499',
        expectedFilename: 'refactor-proof-abc123-asset-499.png',
      },
      roleEntry: {
        path: '/studio/content/scale-posts/refactor-proof-abc123-entry-1',
        title: 'refactor-proof-abc123 Role probe',
        bodyBytes: LIVE_PROOF_TARGET_SCALE.longMdcBytes,
      },
      relationEntry: {
        collection: 'scale-posts',
        stableId: 'refactor-proof-abc123-docs-0000',
        title: 'refactor-proof-abc123 page 0000 en',
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
  it('reports auth provisioning failures without credential values', async () => {
    const description = await describeSanitizedAuthFailure(
      new Response(
        JSON.stringify({
          code: 'ACCOUNT_REJECTED',
          message: 'owner@example.test used not-a-real-password',
        }),
      ),
      ['owner@example.test', 'not-a-real-password'],
    )

    expect(description).toContain('ACCOUNT_REJECTED')
    expect(description).not.toContain('owner@example.test')
    expect(description).not.toContain('not-a-real-password')
  })

  it('gives the retained Nuxt server only its required runtime environment', () => {
    const environment = createLiveCandidateServerEnvironment(
      {
        BETTER_AUTH_SECRETS: 'must-not-reach-nuxt',
        CONVEX_DEPLOY_KEY: 'must-not-reach-nuxt',
        GINKO_CMS_TEST_OWNER_PASSWORD: 'must-not-reach-nuxt',
        CONVEX_URL: 'https://disposable.convex.cloud',
        BCN_AUTH_PROXY_IP_SECRET: 'server-required-secret',
      },
      { host: '127.0.0.1', port: '3000' },
    )

    expect(environment).toEqual({
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3000',
      CONVEX_URL: 'https://disposable.convex.cloud',
      BCN_AUTH_PROXY_IP_SECRET: 'server-required-secret',
    })
  })

  it('[AST-02] keeps the browser upload fixture valid under public image byte verification', async () => {
    const smoke = await readFile(resolve(root, 'scripts/cms-live-story-smoke.mjs'), 'utf8')
    expect(smoke).toContain(liveUploadPng.toString('base64'))
    await expect(verifyPublicImageBytes(liveUploadPng, 'image/png')).resolves.toMatchObject({
      mediaType: 'image/png',
      width: 1,
      height: 1,
      frames: 1,
    })
  })
  it('[AST-05][AST-07] certifies canonical references before the asset trash journey', async () => {
    const fixtures = await readFile(resolve(root, 'scripts/consumer-live-fixtures.mjs'), 'utf8')
    const componentMaintenance = await readFile(
      resolve(root, 'packages/convex/src/maintenance.ts'),
      'utf8',
    )
    const hostMaintenance = await readFile(
      resolve(root, 'packages/cms/templates/convex/ginkoCms/maintenance.ts'),
      'utf8',
    )
    const componentEntrypoints = await readFile(
      resolve(root, 'packages/convex/scripts/build-component-entrypoints.mjs'),
      'utf8',
    )
    expect(componentMaintenance).toContain('startProjectionRepairRun')
    expect(componentEntrypoints).toMatch(/componentModules = \[[\s\S]*?'maintenance'/)
    expect(hostMaintenance).toContain('components.ginkoCms.maintenance.startProjectionRepairRun')
    expect(hostMaintenance).not.toContain('components.ginkoCms.entries.projectionMaintenance')
    expect(fixtures).toContain('ginkoCms/maintenance:startProjectionRepairRun')
    expect(fixtures).toContain('ginkoCms/maintenance:getProjectionRepairRun')
    expect(fixtures).toContain("status.state !== 'complete' || status.issueCount !== 0")
    expect(fixtures.indexOf('await certifyCanonicalProjections(prefix, owner)')).toBeGreaterThan(
      fixtures.indexOf('browser baseline must reserve one asset slot'),
    )
  })
  it('waits for the invalid-credential UI state instead of racing the HTTP response', async () => {
    const smoke = await readFile(resolve(root, 'scripts/cms-live-story-smoke.mjs'), 'utf8')
    expect(smoke).toContain("waitFor({ state: 'visible', timeout: 10_000 })")
    expect(smoke).toContain('!(await error.textContent())?.trim()')
  })
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
    expect(() =>
      validateLiveProofPreflight(
        { ...preflightEnvironment(), CONVEX_DEPLOY_KEY: '' },
        { existsSync: () => true },
      ),
    ).toThrow(/CONVEX_DEPLOY_KEY is required/i)
    expect(() =>
      validateLiveProofPreflight(
        { ...preflightEnvironment(), BCN_AUTH_TRUSTED_CLIENT_IP_HEADER: '' },
        { existsSync: () => true },
      ),
    ).toThrow(/BCN_AUTH_TRUSTED_CLIENT_IP_HEADER is required/i)
    expect(() =>
      validateLiveProofPreflight(
        { ...preflightEnvironment(), BCN_AUTH_PROXY_IP_SECRET: '' },
        { existsSync: () => true },
      ),
    ).toThrow(/BCN_AUTH_PROXY_IP_SECRET is required/i)
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
        relationEntry: { stableId: 'refactor-proof-abc123-docs-0000' },
      },
    })
    const inflated = fixtureManifest()
    inflated.targetScale.entries = 100_000
    expect(() => validateLiveFixtureManifest(inflated, 'refactor-proof-abc123')).toThrow(
      /must be exactly 1500/i,
    )
    const withoutUploadSlot = fixtureManifest()
    withoutUploadSlot.journeyBaseline.assets = LIVE_PROOF_TARGET_SCALE.assets
    expect(() => validateLiveFixtureManifest(withoutUploadSlot, 'refactor-proof-abc123')).toThrow(
      /reserve exactly one asset slot/i,
    )
    const singleLocaleReview = fixtureManifest()
    singleLocaleReview.probes.pendingReview.localeCodes = ['en']
    expect(() => validateLiveFixtureManifest(singleLocaleReview, 'refactor-proof-abc123')).toThrow(
      /atomically publish exactly en and de/i,
    )
    const unisolated = fixtureManifest()
    unisolated.probes.deepSearch.query = 'shared-deployment-row'
    expect(() => validateLiveFixtureManifest(unisolated, 'refactor-proof-abc123')).toThrow(
      /every deep-search query token/i,
    )
    const invalidRoleRoute = fixtureManifest()
    invalidRoleRoute.probes.roleEntry.path = '/studio/content/scale-posts'
    expect(() => validateLiveFixtureManifest(invalidRoleRoute, 'refactor-proof-abc123')).toThrow(
      /exact Studio entry route/i,
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
      globalRemaining: {
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
        {
          ...complete,
          globalRemaining: { ...complete.globalRemaining, assets: 1 },
        },
        'refactor-proof-abc123',
      ),
    ).toThrow(/neither discarded nor fully cleaned/i)
  })

  it('keeps live certification source wiring fail-closed', async () => {
    const [
      runner,
      fixtureDriver,
      smoke,
      performance,
      roles,
      observability,
      mcp,
      studio,
      browserAuth,
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
      readFile(resolve(root, 'scripts/live-proof/browser-auth.mjs'), 'utf8'),
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
    expect(runner).toContain('removeBootstrapOwner: true')
    expect(runner).toContain('journeyCleanup?.siteDataDeleted === true')
    expect(runner).toContain("status: browserGreen ? 'automated-green-in-app-browser-pending'")
    expect(fixtureDriver).toContain("'liveFixtures:setupEntriesPage'")
    expect(fixtureDriver).toContain("'liveFixtures:setupAssetsPage'")
    expect(fixtureDriver).toContain('uploadSlot.deleted !== 1')
    expect(fixtureDriver).toContain('journeyCounts.assets !== targetScale.assets - 1')
    expect(fixtureDriver).toContain('reservedUploadSlots: 1')
    expect(fixtureDriver).toContain('terminalPageStart')
    expect(fixtureDriver).toContain('waitForStudioSearchIndex')
    expect(fixtureDriver).toContain("'ginkoCms/editor:listEntriesForStudio'")
    expect(fixtureDriver).toContain("'liveFixtures/cleanup:cleanupEntriesPage'")
    expect(fixtureDriver).toContain("'liveFixtures/cleanup:cleanupAssetsPage'")
    expect(fixtureDriver).toContain("'GINKO_CMS_LIVE_FIXTURES'")
    expect(fixtureDriver).toContain('process.env.CONVEX_DEPLOY_KEY?.trim()')
    expect(fixtureDriver).toContain('process.env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim()')
    expect(fixtureDriver).toContain('new ConvexHttpClient(convexUrl)')
    expect(fixtureDriver).toContain('client.function(functionName, component, args)')
    expect(fixtureDriver).toContain("'--deployment'")
    expect(fixtureDriver).toContain("cliArgs.push('--component', component)")
    expect(fixtureDriver).toContain("cliArgs.push('--identity', JSON.stringify(actingAs))")
    expect(fixtureDriver).toContain('tokenIdentifier: `https://convex.test|${identity.subject}`')
    expect(fixtureDriver).toContain("readDeploymentEnv('GINKO_CMS_LIVE_FIXTURES')")
    expect(fixtureDriver).toContain("model: 'session'")
    expect(fixtureDriver).toContain("model: 'rateLimit'")
    expect(fixtureDriver).toContain('await resetDisposableAuthState(members)')
    expect(fixtureDriver).toContain(
      'Disposable live fixture did not produce the required pending review.',
    )
    expect(fixtureDriver).toContain("command === 'cleanup-final'")
    expect(smoke).toContain("'candidate.exact-packed-consumer'")
    expect(smoke).toContain('validateCandidateAttestation')
    expect(smoke).toContain('performanceSampleCount < 20')
    expect(smoke).toContain('await runRoleJourneys({')
    expect(smoke).toContain('await mcpProof.runStories()')
    expect(smoke).toContain('await performanceProof.runJourney({')
    expect(performance).toContain('[data-testid="cms-richtext-editor"]')
    expect(performance).toContain('fixtureManifest.probes.roleEntry.bodyBytes')
    expect(performance).toContain('globalThis.__ginkoKeystrokeMeasurement = measurement')
    expect(performance).toContain('Number.isFinite(globalThis.__ginkoKeystrokeMeasurement?.value)')
    expect(performance).toContain('{ timeout: 5000 }')
    expect(performance).not.toContain('const measurement = page.evaluate(')
    expect(performance).toContain("name: 'Publish (EN)?'")
    expect(performance).not.toContain("name: 'Publish?'")
    expect(studio).toContain("'scale.entry-pagination-1205'")
    expect(studio).toContain("name: 'Publish (EN)?'")
    expect(studio).toContain("name: 'Publish (EN)', exact: true")
    expect(studio).toContain("name: 'Body Markdown source'")
    expect(studio).toContain('filter({ hasText: relationProbe.title }).waitFor')
    expect(studio).toContain("name: 'History', exact: true")
    expect(studio).toContain('Historical public rollback did not preserve the current draft.')
    expect(studio).toContain('Historical public rollback did not restore the older live output.')
    expect(studio).toContain("name: 'Move asset to trash?'")
    expect(studio).not.toContain("name: 'Move selected assets to trash?'")
    expect(browserAuth).toContain("response.status() !== 429")
    expect(studio).toContain(".locator('.studio-entry-topbar')")
    expect(studio).toContain(".getByText('Live', { exact: true })")
    expect(studio).toContain('const mismatchPage = await page.context().newPage()')
    expect(studio).toContain("pathname === '/studio/auth/signin'")
    expect(studio).toContain("signIn(mismatchPage, '/studio/model', undefined, mismatchUrl.origin)")
    expect(studio).not.toContain('mismatchContext')
    expect(studio).toContain('`${mismatchUrl.origin}/studio/model`')
    expect(publicProof).toContain("'scale.public-routes-target-fixture'")
    expect(siteData).toContain("'site-data.localized-public-lifecycle'")
    expect(siteData).toContain('/api/_content/site-data?key=')
    expect(siteData).toContain('[data-testid="cms-site-data-ready"][data-hydrated="true"]')
    expect(siteData).toContain("page.locator('#new-localized')")
    expect(siteData).toContain("getByRole('group', { name: 'Language' })")
    expect(siteData).toContain("getByRole('button', { name: 'de', exact: true })")
    expect(packedHost).toContain(
      `modules: ['@nuxtjs/sitemap', 'nuxt-i18n-micro', '@lupinum/ginko-content', ginkoCms]`,
    )
    expect(packedHost).toContain(
      "'nuxt-i18n-micro': compatibilityMatrix.tracked['nuxt-i18n-micro'][0]",
    )
    expect(packedHost).toContain(
      "relatedDoc: { type: 'relation', localized: false, relation: { collectionId: 'docs', multiple: false } }",
    )
    expect(packedHost).toContain("i18n: { autoDetectLanguage: false, defaultLocale: 'en'")
    expect(packedHost).toContain("compatibilityDate: '2026-08-23'")
    expect(packedHost).toContain('site: { url: process.env.CMS_STORY_SITE_URL')
    expect(packedHost).toContain("routeRules: { '/render-safety': { prerender: false } }")
    expect(packedHost).toContain("const pageDirectory = join(tempDir, 'app/pages')")
    expect(accountProvisioner).toContain('origin: baseUrl')
    expect(accountProvisioner).toContain('response.status !== 429')
    expect(accountProvisioner).toContain('1_000 * 2 ** attempt')
    for (const metric of [
      'studioColdInteractive',
      'primaryNavigation',
      'searchFilter',
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
    expect(roles).toContain('const newEntryAvailable =')
    expect(roles).toContain(
      'a[href$="/content/${fixtureManifest.probes.deepSearch.collection}/new"]',
    )
    expect(roles).toContain("if (role !== 'viewer')")
    expect(roles).not.toContain("name: 'New entry'")
    expect(roles).toContain('const mediaAvailable =')
    expect(roles).toContain('a[href="/assets"], a[href="/studio/assets"]')
    expect(roles).toContain('a[href="/reviews"], a[href="/studio/reviews"]')
    expect(roles).toContain("['/studio/settings', 'Settings']")
    expect(roles).toContain("'Invite member'")
    expect(roles).toContain("'Add refresh target'")
    expect(roles).toContain("'MCP connections for AI tools'")
    expect(roles).not.toContain('const mediaVisible =')
    expect(roles).not.toContain('newEntryVisible,')
    expect(observability).toContain("if (!['warning', 'error'].includes(message.type())) return")
    expect(observability).toContain('expectedConsoleFailures')
    expect(observability).toContain('expectedHttpFailure(url, status)')
    expect(smoke).toContain('invalidCredentialsExpectedUntil = Date.now() + 5_000')
    expect(smoke).toContain('Date.now() + 1_000')
    expect(smoke).toContain("'--host-resolver-rules=MAP localhost 127.0.0.1'")
    expect(smoke).toContain('name: /^Members(?:\\s+\\d+)?$/')
    expect(smoke).toContain("name: 'Invite member'")
    expect(smoke).toContain(".getByText('Draft', { exact: true })")
    expect(smoke).not.toContain("name: 'Add member'")
    expect(mcp).toContain("'request-publish-review'")
  })
})
