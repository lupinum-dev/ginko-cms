import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

export const LIVE_PROOF_ROLES = ['viewer', 'editor', 'publisher', 'owner']

export const LIVE_PROOF_TARGET_SCALE = Object.freeze({
  entries: 1500,
  locales: 3,
  assets: 500,
  treeDepth: 5,
  longMdcBytes: 65_408,
  paginationRows: 1205,
  // The canonical live fixture has 1,500 entries × three locales. The
  // separate deterministic target-scale suite retains the 5,105-row former
  // boundary probe without making the disposable fixture internally false.
  publicRows: 4500,
  portabilityDocuments: 5000,
  portabilityAssets: 500,
})

export const LIVE_PROOF_VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'narrow', width: 390, height: 844 },
])

export const IN_APP_BROWSER_STORY_IDS = Object.freeze([
  'auth.deep-link-wrong-password-login-claim-logout',
  'navigation.dashboard-and-deep-links',
  'contract.installed-and-mismatch-write-block',
  'editorial.create-autosave-and-concurrent-edit',
  'editorial.locale-publish-all-preview-history-restore-rollback',
  'routing.tree-move-rename-redirect-search-nav-sitemap-alternates',
  'assets.references-trash-restore-recovery-purge-blockers',
  'site-data.public-transitions',
  'mcp.key-review-approval-revocation-401',
  'scale.deep-pagination-and-search',
  'responsive.desktop-tablet-and-narrow',
  'accessibility.keyboard-reduced-motion-and-axe',
  'observability.console-network-overflow-clean',
])

const candidatePackages = [
  '@lupinum/ginko-content',
  '@lupinum/ginko-cms-contract',
  '@lupinum/ginko-cms-convex',
  '@lupinum/ginko-cms',
  '@lupinum/better-convex-nuxt',
]

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}

function requiredInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`)
  }
  return value
}

export function requiredEnvironmentValue(name, env = process.env) {
  return requiredString(env[name], name)
}

function requireFile(path, label, exists = existsSync) {
  const value = requiredString(path, label)
  if (!isAbsolute(value)) throw new Error(`${label} must be an absolute path.`)
  if (!exists(value)) throw new Error(`${label} does not exist: ${value}`)
  return value
}

function exactOriginUrl(value, label) {
  const raw = requiredString(value, label)
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`)
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`)
  }
  url.hash = ''
  return url
}

function roleEnvPrefix(role) {
  return `GINKO_CMS_TEST_${role.toUpperCase()}`
}

export function readDisposableRoleCredentials(env = process.env) {
  const roles = Object.fromEntries(
    LIVE_PROOF_ROLES.map((role) => {
      const prefix = roleEnvPrefix(role)
      return [
        role,
        {
          email: requiredString(env[`${prefix}_EMAIL`], `${prefix}_EMAIL`),
          password: requiredString(env[`${prefix}_PASSWORD`], `${prefix}_PASSWORD`),
        },
      ]
    }),
  )
  const normalizedEmails = Object.values(roles).map(({ email }) => email.toLowerCase())
  if (new Set(normalizedEmails).size !== LIVE_PROOF_ROLES.length) {
    throw new Error('Live proof requires a different disposable account for every CMS role.')
  }
  return roles
}

export function validateLiveProofPreflight(env = process.env, options = {}) {
  if (env.GINKO_CMS_DISPOSABLE_DEPLOYMENT !== '1') {
    throw new Error(
      'Live refactor proof requires GINKO_CMS_DISPOSABLE_DEPLOYMENT=1 and must never reuse a development deployment.',
    )
  }
  const convexUrl = exactOriginUrl(env.CONVEX_URL, 'CONVEX_URL')
  const cloudConfigured = Boolean(env.CONVEX_DEPLOYMENT?.trim() || env.CONVEX_DEPLOY_KEY?.trim())
  const selfHostedConfigured = Boolean(
    env.CONVEX_SELF_HOSTED_URL?.trim() || env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim(),
  )
  if (cloudConfigured === selfHostedConfigured) {
    throw new Error(
      'Live proof requires exactly one Convex authority: CONVEX_DEPLOYMENT plus CONVEX_DEPLOY_KEY, or CONVEX_SELF_HOSTED_URL plus CONVEX_SELF_HOSTED_ADMIN_KEY.',
    )
  }
  const deployment = cloudConfigured
    ? {
        kind: 'cloud',
        identity: requiredString(env.CONVEX_DEPLOYMENT, 'CONVEX_DEPLOYMENT'),
        key: requiredString(env.CONVEX_DEPLOY_KEY, 'CONVEX_DEPLOY_KEY'),
      }
    : {
        kind: 'self-hosted',
        identity: exactOriginUrl(env.CONVEX_SELF_HOSTED_URL, 'CONVEX_SELF_HOSTED_URL').origin,
        key: requiredString(env.CONVEX_SELF_HOSTED_ADMIN_KEY, 'CONVEX_SELF_HOSTED_ADMIN_KEY'),
      }
  if (deployment.kind === 'self-hosted' && convexUrl.origin !== deployment.identity) {
    throw new Error('CONVEX_URL must match the self-hosted Convex origin used for live proof.')
  }
  const fixturePrefix = requiredString(env.GINKO_CMS_FIXTURE_PREFIX, 'GINKO_CMS_FIXTURE_PREFIX')
  if (!/^refactor-[a-z0-9][a-z0-9-]{5,}$/i.test(fixturePrefix)) {
    throw new Error(
      'GINKO_CMS_FIXTURE_PREFIX must be a unique refactor- prefix with at least six suffix characters.',
    )
  }
  if (env.GINKO_CMS_TEST_EMAIL || env.GINKO_CMS_TEST_PASSWORD) {
    throw new Error(
      'Certification rejects legacy single-account smoke credentials; configure the four disposable role accounts instead.',
    )
  }
  const baseUrl = exactOriginUrl(env.CMS_STORY_BASE_URL, 'CMS_STORY_BASE_URL')
  if (!['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) {
    requiredString(env.BCN_AUTH_TRUSTED_CLIENT_IP_HEADER, 'BCN_AUTH_TRUSTED_CLIENT_IP_HEADER')
    requiredString(env.BCN_AUTH_PROXY_IP_SECRET, 'BCN_AUTH_PROXY_IP_SECRET')
  }
  const attestationUrl = exactOriginUrl(
    env.CMS_STORY_CANDIDATE_ATTESTATION_URL,
    'CMS_STORY_CANDIDATE_ATTESTATION_URL',
  )
  if (attestationUrl.origin !== baseUrl.origin) {
    throw new Error(
      'Candidate attestation must be served by the exact browser-tested consumer origin.',
    )
  }
  const mismatchUrl = exactOriginUrl(
    env.CMS_STORY_CONTRACT_MISMATCH_URL,
    'CMS_STORY_CONTRACT_MISMATCH_URL',
  )
  if (mismatchUrl.origin === baseUrl.origin) {
    throw new Error('Contract mismatch proof requires a distinct packed-consumer origin.')
  }
  const exists = options.existsSync ?? existsSync
  const roles = readDisposableRoleCredentials(env)
  for (const [role, credentials] of Object.entries(roles)) {
    if (!credentials.email.toLowerCase().includes(fixturePrefix.toLowerCase())) {
      throw new Error(`${role} disposable account email must contain ${fixturePrefix}.`)
    }
  }
  return {
    deployment: { kind: deployment.kind, identity: deployment.identity },
    fixturePrefix,
    baseUrl: baseUrl.toString().replace(/\/$/, ''),
    candidateAttestationUrl: attestationUrl.toString(),
    contractMismatchUrl: mismatchUrl.toString().replace(/\/$/u, ''),
    candidateArtifactPath: requireFile(
      env.GINKO_CMS_CANDIDATE_ARTIFACT,
      'GINKO_CMS_CANDIDATE_ARTIFACT',
      exists,
    ),
    fixtureModulePath: requireFile(
      env.GINKO_CMS_LIVE_FIXTURE_MODULE ??
        resolve(import.meta.dirname, 'consumer-live-fixtures.mjs'),
      'GINKO_CMS_LIVE_FIXTURE_MODULE',
      exists,
    ),
    roles,
  }
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'))
}

export function validateCandidateArtifact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Candidate artifact must be a JSON object.')
  }
  const commit = requiredString(value.source?.commit, 'candidate source.commit')
  if (value.source?.dirty !== false)
    throw new Error('Candidate artifact must record a clean source.')
  const artifacts = value.artifacts
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    throw new Error('Candidate artifact must contain package artifacts.')
  }
  const packages = Object.fromEntries(
    candidatePackages.map((name) => {
      const artifact = artifacts[name]
      const sha256 = requiredString(artifact?.sha256, `candidate artifact ${name}.sha256`)
      if (!/^[a-f0-9]{64}$/i.test(sha256)) {
        throw new Error(`Candidate artifact ${name}.sha256 must be a SHA-256 digest.`)
      }
      return [
        name,
        {
          version: requiredString(artifact?.version, `candidate artifact ${name}.version`),
          commit: requiredString(artifact?.commit, `candidate artifact ${name}.commit`),
          sha256: sha256.toLowerCase(),
        },
      ]
    }),
  )
  return { commit, packages }
}

export function validateCandidateAttestation(value, candidate) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Candidate attestation must be a JSON object.')
  }
  if (value.schemaVersion !== 1) throw new Error('Candidate attestation schemaVersion must be 1.')
  if (value.sourceCommit !== candidate.commit) {
    throw new Error('Browser target source commit does not match the packed candidate.')
  }
  for (const [name, expected] of Object.entries(candidate.packages)) {
    const actual = value.packages?.[name]
    if (
      actual?.version !== expected.version ||
      actual?.sha256?.toLowerCase() !== expected.sha256 ||
      actual?.commit !== expected.commit
    ) {
      throw new Error(`Browser target package attestation does not match ${name}.`)
    }
  }
  return { sourceCommit: value.sourceCommit, packages: candidate.packages }
}

function requireProbe(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  const result = {}
  for (const field of fields) result[field] = requiredString(value[field], `${label}.${field}`)
  return result
}

function requireFixtureMarker(value, label, fixturePrefix) {
  if (!String(value).toLowerCase().includes(fixturePrefix.toLowerCase())) {
    throw new Error(`${label} must contain the unique fixture prefix ${fixturePrefix}.`)
  }
}

export function validateLiveFixtureManifest(value, expectedPrefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Live fixture manifest must be a JSON object.')
  }
  if (value.schemaVersion !== 1) throw new Error('Live fixture manifest schemaVersion must be 1.')
  if (value.fixturePrefix !== expectedPrefix) {
    throw new Error('Live fixture manifest prefix does not match this proof run.')
  }
  const scale = Object.fromEntries(
    Object.entries(LIVE_PROOF_TARGET_SCALE).map(([key, expected]) => {
      const actual = requiredInteger(value.targetScale?.[key], `targetScale.${key}`)
      if (actual !== expected) {
        throw new Error(`targetScale.${key} must be exactly ${expected}; received ${actual}.`)
      }
      return [key, actual]
    }),
  )
  const journeyBaseline = {
    assets: requiredInteger(value.journeyBaseline?.assets, 'journeyBaseline.assets'),
    reservedUploadSlots: requiredInteger(
      value.journeyBaseline?.reservedUploadSlots,
      'journeyBaseline.reservedUploadSlots',
    ),
  }
  if (journeyBaseline.assets !== scale.assets - 1 || journeyBaseline.reservedUploadSlots !== 1) {
    throw new Error('Live fixture must reserve exactly one asset slot for the browser journey.')
  }
  if (!Array.isArray(value.localeCodes) || value.localeCodes.length !== scale.locales) {
    throw new Error(`localeCodes must contain exactly ${scale.locales} locales.`)
  }
  const localeCodes = value.localeCodes.map((locale, index) =>
    requiredString(locale, `localeCodes[${index}]`),
  )
  if (!localeCodes.includes('en') || !localeCodes.includes('de')) {
    throw new Error('Live fixtures must include both en and de locales.')
  }
  const probes = {
    entryPagination: {
      ...requireProbe(value.probes?.entryPagination, 'probes.entryPagination', [
        'collection',
        'workState',
        'terminalTitle',
      ]),
      expectedRows: requiredInteger(
        value.probes?.entryPagination?.expectedRows,
        'probes.entryPagination.expectedRows',
      ),
    },
    deepSearch: requireProbe(value.probes?.deepSearch, 'probes.deepSearch', [
      'collection',
      'query',
      'expectedTitle',
    ]),
    assetSearch: requireProbe(value.probes?.assetSearch, 'probes.assetSearch', [
      'query',
      'expectedFilename',
    ]),
    roleEntry: {
      ...requireProbe(value.probes?.roleEntry, 'probes.roleEntry', ['path', 'title']),
      bodyBytes: requiredInteger(value.probes?.roleEntry?.bodyBytes, 'probes.roleEntry.bodyBytes'),
    },
    relationEntry: requireProbe(value.probes?.relationEntry, 'probes.relationEntry', [
      'collection',
      'stableId',
      'title',
    ]),
    routeRedirect: requireProbe(value.probes?.routeRedirect, 'probes.routeRedirect', [
      'sourcePath',
      'targetPath',
    ]),
    pendingReview: {
      ...requireProbe(value.probes?.pendingReview, 'probes.pendingReview', ['title']),
      localeCodes: Array.isArray(value.probes?.pendingReview?.localeCodes)
        ? value.probes.pendingReview.localeCodes.map((locale, index) =>
            requiredString(locale, `probes.pendingReview.localeCodes[${index}]`),
          )
        : [],
      publicPaths: {
        en: requiredString(
          value.probes?.pendingReview?.publicPaths?.en,
          'probes.pendingReview.publicPaths.en',
        ),
        de: requiredString(
          value.probes?.pendingReview?.publicPaths?.de,
          'probes.pendingReview.publicPaths.de',
        ),
      },
    },
    mcpReview: {
      ...requireProbe(value.probes?.mcpReview, 'probes.mcpReview', [
        'entryId',
        'locale',
        'reviewTitle',
      ]),
      expectedVersion: requiredInteger(
        value.probes?.mcpReview?.expectedVersion,
        'probes.mcpReview.expectedVersion',
      ),
    },
    publicRoutes: {
      deepestPath: requiredString(
        value.probes?.publicRoutes?.deepestPath,
        'probes.publicRoutes.deepestPath',
      ),
      expectedRows: requiredInteger(
        value.probes?.publicRoutes?.expectedRows,
        'probes.publicRoutes.expectedRows',
      ),
      pathPrefixes: Array.isArray(value.probes?.publicRoutes?.pathPrefixes)
        ? value.probes.publicRoutes.pathPrefixes.map((prefix, index) =>
            requiredString(prefix, `probes.publicRoutes.pathPrefixes[${index}]`),
          )
        : [],
    },
  }
  if (probes.entryPagination.expectedRows !== scale.paginationRows) {
    throw new Error('Entry pagination probe must cover exactly 1,205 rows.')
  }
  if (probes.entryPagination.workState !== 'changed') {
    throw new Error('Entry pagination probe must use the indexed changed-work filter.')
  }
  if (probes.roleEntry.bodyBytes !== scale.longMdcBytes) {
    throw new Error('Role-entry probe must contain the exact near-limit MDC fixture.')
  }
  if (!/^\/studio\/content\/[^/]+\/[^/?#]+$/.test(probes.roleEntry.path)) {
    throw new Error('Role-entry probe must use an exact Studio entry route.')
  }
  if (probes.publicRoutes.expectedRows !== scale.publicRows) {
    throw new Error(`Public-route probe must cover exactly ${scale.publicRows} rows.`)
  }
  if (probes.publicRoutes.pathPrefixes.length === 0) {
    throw new Error('Public-route probe requires at least one fixture-only path prefix.')
  }
  for (const [label, value] of [
    ['probes.entryPagination.terminalTitle', probes.entryPagination.terminalTitle],
    ['probes.deepSearch.expectedTitle', probes.deepSearch.expectedTitle],
    ['probes.assetSearch.expectedFilename', probes.assetSearch.expectedFilename],
    ['probes.roleEntry.title', probes.roleEntry.title],
    ['probes.relationEntry.stableId', probes.relationEntry.stableId],
    ['probes.relationEntry.title', probes.relationEntry.title],
    ['probes.routeRedirect.sourcePath', probes.routeRedirect.sourcePath],
    ['probes.routeRedirect.targetPath', probes.routeRedirect.targetPath],
    ['probes.pendingReview.title', probes.pendingReview.title],
    ['probes.pendingReview.publicPaths.en', probes.pendingReview.publicPaths.en],
    ['probes.pendingReview.publicPaths.de', probes.pendingReview.publicPaths.de],
    ['probes.mcpReview.reviewTitle', probes.mcpReview.reviewTitle],
    ['probes.publicRoutes.deepestPath', probes.publicRoutes.deepestPath],
    ...probes.publicRoutes.pathPrefixes.map((value, index) => [
      `probes.publicRoutes.pathPrefixes[${index}]`,
      value,
    ]),
  ]) {
    requireFixtureMarker(value, label, expectedPrefix)
  }
  const deepSearchTitleTokens = new Set(
    probes.deepSearch.expectedTitle.toLocaleLowerCase().split(/\s+/u),
  )
  const deepSearchQueryTokens = probes.deepSearch.query.toLocaleLowerCase().split(/\s+/u)
  if (!deepSearchQueryTokens.every((token) => deepSearchTitleTokens.has(token))) {
    throw new Error('Every deep-search query token must occur exactly in its expected title.')
  }
  if (!probes.assetSearch.expectedFilename.includes(probes.assetSearch.query)) {
    throw new Error('The asset-search query must occur exactly in its expected filename.')
  }
  if (
    probes.pendingReview.localeCodes.length !== 2 ||
    !probes.pendingReview.localeCodes.includes('en') ||
    !probes.pendingReview.localeCodes.includes('de')
  ) {
    throw new Error('Pending review probe must atomically publish exactly en and de.')
  }
  const mismatchUrl = exactOriginUrl(
    value.probes?.contractMismatchUrl,
    'probes.contractMismatchUrl',
  ).toString()
  return {
    schemaVersion: 1,
    fixturePrefix: expectedPrefix,
    targetScale: scale,
    journeyBaseline,
    localeCodes,
    probes: { ...probes, contractMismatchUrl: mismatchUrl },
    cleanupExpected: value.cleanupExpected ?? null,
  }
}

export function validateInAppBrowserEvidence(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('In-app Browser evidence must be a JSON object.')
  }
  if (value.schemaVersion !== 1) {
    throw new Error('In-app Browser evidence schemaVersion must be 1.')
  }
  if (requiredString(value.commit, 'in-app Browser commit') !== expected.commit) {
    throw new Error('In-app Browser evidence commit does not match the packed candidate.')
  }
  const artifactSha256 = requiredString(
    value.candidateArtifactSha256,
    'in-app Browser candidateArtifactSha256',
  ).toLowerCase()
  if (artifactSha256 !== expected.candidateArtifactSha256.toLowerCase()) {
    throw new Error('In-app Browser evidence does not match the candidate artifact bytes.')
  }
  if (
    requiredString(value.fixturePrefix, 'in-app Browser fixturePrefix') !== expected.fixturePrefix
  ) {
    throw new Error('In-app Browser evidence fixture prefix does not match this proof run.')
  }
  const origin = exactOriginUrl(value.browserOrigin, 'in-app Browser browserOrigin').origin
  if (origin !== expected.browserOrigin) {
    throw new Error('In-app Browser evidence origin does not match the packed consumer origin.')
  }
  const startedAt = Date.parse(requiredString(value.startedAt, 'in-app Browser startedAt'))
  const finishedAt = Date.parse(requiredString(value.finishedAt, 'in-app Browser finishedAt'))
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    throw new Error('In-app Browser evidence timestamps are invalid.')
  }
  if (!Array.isArray(value.journeys)) throw new Error('In-app Browser journeys must be an array.')
  const journeyIds = value.journeys.map((journey, index) => {
    if (!journey || typeof journey !== 'object' || Array.isArray(journey)) {
      throw new Error(`in-app Browser journeys[${index}] must be an object.`)
    }
    const id = requiredString(journey.id, `in-app Browser journeys[${index}].id`)
    if (journey.status !== 'passed') throw new Error(`In-app Browser journey ${id} did not pass.`)
    return id
  })
  if (new Set(journeyIds).size !== journeyIds.length) {
    throw new Error('In-app Browser evidence contains duplicate journey IDs.')
  }
  const missingJourneys = IN_APP_BROWSER_STORY_IDS.filter((id) => !journeyIds.includes(id))
  if (missingJourneys.length > 0) {
    throw new Error(`In-app Browser evidence is missing journeys: ${missingJourneys.join(', ')}.`)
  }
  const viewportNames = new Set(
    Array.isArray(value.viewports)
      ? value.viewports.map((viewport, index) =>
          requiredString(viewport?.name, `in-app Browser viewports[${index}].name`),
        )
      : [],
  )
  for (const { name } of LIVE_PROOF_VIEWPORTS) {
    if (!viewportNames.has(name)) throw new Error(`In-app Browser evidence is missing ${name}.`)
  }
  const accessibility = value.accessibility
  if (
    accessibility?.keyboard !== true ||
    accessibility?.reducedMotion !== true ||
    requiredInteger(accessibility?.seriousViolations, 'accessibility.seriousViolations') !== 0 ||
    requiredInteger(accessibility?.criticalViolations, 'accessibility.criticalViolations') !== 0 ||
    requiredInteger(accessibility?.horizontalOverflow, 'accessibility.horizontalOverflow') !== 0
  ) {
    throw new Error('In-app Browser accessibility evidence is not green.')
  }
  const observability = value.observability
  for (const key of ['consoleErrors', 'consoleWarnings', 'pageErrors', 'failedRequests']) {
    if (requiredInteger(observability?.[key], `observability.${key}`) !== 0) {
      throw new Error(`In-app Browser observability reported ${key}.`)
    }
  }
  if (
    value.credentialHandling?.typedInteractively !== true ||
    value.credentialHandling?.persisted !== false ||
    value.credentialHandling?.captured !== false
  ) {
    throw new Error('In-app Browser owner credential handling is not compliant.')
  }
  if (!Array.isArray(value.screenshots) || value.screenshots.length < 3) {
    throw new Error('In-app Browser evidence requires at least three screenshots.')
  }
  const screenshots = value.screenshots.map((path, index) => {
    const normalized = requiredString(path, `in-app Browser screenshots[${index}]`)
    if (normalized.startsWith('/') || normalized.includes('..')) {
      throw new Error('In-app Browser screenshot paths must be relative artifact paths.')
    }
    return normalized
  })
  return {
    schemaVersion: 1,
    commit: expected.commit,
    candidateArtifactSha256: artifactSha256,
    fixturePrefix: expected.fixturePrefix,
    browserOrigin: origin,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    journeys: value.journeys,
    viewports: value.viewports,
    accessibility,
    observability,
    credentialHandling: value.credentialHandling,
    screenshots,
  }
}

export function validateCleanupLedger(value, expectedPrefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Fixture cleanup ledger must be a JSON object.')
  }
  if (value.schemaVersion !== 1) throw new Error('Fixture cleanup schemaVersion must be 1.')
  if (value.fixturePrefix !== expectedPrefix) {
    throw new Error('Fixture cleanup prefix does not match this proof run.')
  }
  const remaining = value.globalRemaining
  if (!remaining || typeof remaining !== 'object' || Array.isArray(remaining)) {
    throw new Error('Fixture cleanup ledger must report global remaining CMS records.')
  }
  const remainingCounts = Object.fromEntries(
    ['entries', 'assets', 'reviews', 'redirects', 'siteData', 'mcpConnections', 'members'].map(
      (key) => [key, requiredInteger(remaining[key], `cleanup.remaining.${key}`)],
    ),
  )
  const deploymentDiscarded = value.deploymentDiscarded === true
  const fullyCleaned = Object.values(remainingCounts).every((count) => count === 0)
  if (!deploymentDiscarded && !fullyCleaned) {
    throw new Error('Disposable deployment was neither discarded nor fully cleaned.')
  }
  return {
    schemaVersion: 1,
    fixturePrefix: expectedPrefix,
    deploymentDiscarded,
    fullyCleaned,
    remaining: remainingCounts,
    fixtureRemaining: value.fixtureRemaining ?? null,
    removed: value.removed ?? null,
  }
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
