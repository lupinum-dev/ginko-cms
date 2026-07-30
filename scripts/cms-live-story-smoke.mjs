import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

import {
  readDisposableRoleCredentials,
  requiredEnvironmentValue,
  validateCandidateArtifact,
  validateCandidateAttestation,
  validateLiveFixtureManifest,
} from './live-proof-config.mjs'
import { expectText, signIn as signInWithCredentials } from './live-proof/browser-auth.mjs'
import { createBrowserObservability } from './live-proof/browser-observability.mjs'
import { createMcpProof } from './live-proof/mcp-proof.mjs'
import { createPerformanceProof } from './live-proof/performance-proof.mjs'
import { runPublicJourneys } from './live-proof/public-journeys.mjs'
import { runRoleJourneys } from './live-proof/role-journeys.mjs'
import { runSiteDataProof } from './live-proof/site-data-proof.mjs'
import { runStudioJourneys } from './live-proof/studio-journeys.mjs'

const configuredBaseUrl = process.env.CMS_STORY_BASE_URL
const certification = process.env.CMS_STORY_CERTIFICATION === '1'
const disposableRoles = certification
  ? readDisposableRoleCredentials(process.env)
  : {
      owner: {
        email: process.env.GINKO_CMS_TEST_EMAIL,
        password: process.env.GINKO_CMS_TEST_PASSWORD,
      },
    }
const email = disposableRoles.owner?.email
const password = disposableRoles.owner?.password
const outputPath = process.env.CMS_STORY_OUTPUT ? resolve(process.env.CMS_STORY_OUTPUT) : null
const browserArtifactDir = process.env.CMS_STORY_BROWSER_DIR
  ? resolve(process.env.CMS_STORY_BROWSER_DIR)
  : null
const publicOnly = process.argv.includes('--public-only')

if (!configuredBaseUrl || (!publicOnly && (!email || !password))) {
  throw new Error(
    'cms-live-story-smoke requires CMS_STORY_BASE_URL, plus GINKO_CMS_TEST_EMAIL and GINKO_CMS_TEST_PASSWORD unless --public-only is used.',
  )
}
if (certification && (!outputPath || !browserArtifactDir)) {
  throw new Error('Certification requires CMS_STORY_OUTPUT and CMS_STORY_BROWSER_DIR artifacts.')
}

const baseUrl = configuredBaseUrl.replace(/\/+$/, '')
const fixturePrefix = certification
  ? requiredEnvironmentValue('GINKO_CMS_FIXTURE_PREFIX')
  : (process.env.GINKO_CMS_FIXTURE_PREFIX ?? 'smoke')
const candidateAttestationUrl = certification
  ? requiredEnvironmentValue('CMS_STORY_CANDIDATE_ATTESTATION_URL')
  : null
if (
  candidateAttestationUrl &&
  new URL(candidateAttestationUrl).origin !== new URL(baseUrl).origin
) {
  throw new Error('Candidate attestation must use the exact browser-tested consumer origin.')
}
const fixtureManifest = certification
  ? validateLiveFixtureManifest(
      JSON.parse(
        await readFile(resolve(requiredEnvironmentValue('CMS_STORY_FIXTURE_MANIFEST')), 'utf8'),
      ),
      fixturePrefix,
    )
  : null
const candidate = certification
  ? validateCandidateArtifact(
      JSON.parse(
        await readFile(resolve(requiredEnvironmentValue('CMS_STORY_CANDIDATE_ARTIFACT')), 'utf8'),
      ),
    )
  : null
const performanceSampleCount = certification
  ? Number(process.env.CMS_STORY_PERFORMANCE_SAMPLES ?? '20')
  : 0
if (
  certification &&
  (!Number.isSafeInteger(performanceSampleCount) || performanceSampleCount < 20)
) {
  throw new Error('Certification requires at least 20 performance samples for p95 evidence.')
}
const collection = 'blog'
const collectionLabel = 'Blog'
const fixtureToken = `${fixturePrefix}-${Date.now().toString(36)}`
const fixtureTitle = `V-next live smoke ${fixtureToken}`
const uploadFilename = `${fixturePrefix}-browser-${fixtureToken.split('-').at(-1)}.png`
const uploadFixturePath = resolve(tmpdir(), uploadFilename)
const results = []
let fixtureEntryUrl = null
let localUploadFixtureRemoved = false
let invalidCredentialsExpectedUntil = 0
let authAttemptsInWindow = 0
let lastAuthAttemptAt = 0
const registeredSecrets = new Set()
const performanceProof = createPerformanceProof(performanceSampleCount)
const { evidence: performanceEvidence, samples: performanceSamples } = performanceProof
const screenshotStoryIds = new Set([
  'auth.sign-in-redirect',
  'content.fixture-publish',
  'nav.studio-home',
  'content-model.contract-readonly',
  'content.entry-list-state',
  'content.entry-editor-state',
  'assets.upload-and-trash',
  'site-data.localized-public-lifecycle',
  'public-page.blog',
  'mcp.revoke',
])

// These journeys intentionally expose a one-time credential in the page while
// they verify it. A failure must never persist those pixels as evidence.
const screenshotSensitiveStoryIds = new Set([
  'mcp.create-authenticated',
  'mcp.raw-key-one-time-visible',
])

function redact(value) {
  let redacted = String(value).replace(/[\w-]{24,}/g, '[REDACTED]')
  const roleSecrets = Object.values(disposableRoles).flatMap((credentials) => [
    credentials?.email,
    credentials?.password,
  ])
  for (const secret of [...roleSecrets, ...registeredSecrets]) {
    if (secret) redacted = redacted.replaceAll(secret, '[REDACTED]')
  }
  return redacted
}

function safeArtifactName(value) {
  return value
    .replace(/[^a-z0-9.-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function expectedHttpFailure(url, status) {
  return (
    Date.now() <= invalidCredentialsExpectedUntil &&
    url.includes('/api/auth/sign-in/email') &&
    status >= 400 &&
    status < 500
  )
}

function expectedRequestFailure(request, errorText) {
  if (request.method() !== 'GET' || errorText !== 'net::ERR_ABORTED') return false
  return (
    request.resourceType() === 'image' || new URL(request.url()).origin === new URL(baseUrl).origin
  )
}

async function captureStoryScreenshot(id, suffix = '', targetPage = page) {
  if (!browserArtifactDir || targetPage.isClosed()) return null
  const filename = `${safeArtifactName(id)}${suffix}.png`
  await targetPage.screenshot({ path: resolve(browserArtifactDir, filename), fullPage: false })
  browserEvidence.screenshots.push(filename)
  return filename
}

async function story(id, title, run) {
  if (publicOnly && !id.startsWith('public-')) return
  const startedAt = Date.now()
  try {
    const evidence = await run()
    const screenshot = screenshotStoryIds.has(id) ? await captureStoryScreenshot(id) : null
    results.push({
      id,
      title,
      status: 'passed',
      durationMs: Date.now() - startedAt,
      evidence: screenshot ? { ...(evidence ?? {}), screenshot } : (evidence ?? null),
    })
  } catch (error) {
    const screenshot = screenshotSensitiveStoryIds.has(id)
      ? null
      : await captureStoryScreenshot(id, '-failed').catch(() => null)
    results.push({
      id,
      title,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: redact(error instanceof Error ? error.message : String(error)),
      ...(screenshot ? { screenshot } : {}),
    })
    throw error
  }
}

async function fetchJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init)
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { response, body, text }
}

async function signIn(
  page,
  redirect = '/studio/settings',
  credentials = { email, password },
  origin = baseUrl,
) {
  await paceAuthAttempt()
  await signInWithCredentials(page, redirect, credentials, origin)
}

async function paceAuthAttempt() {
  const authenticationWindowMs = 10_000
  const authenticationWindowMax = 3
  const now = Date.now()
  if (now - lastAuthAttemptAt >= authenticationWindowMs) {
    authAttemptsInWindow = 0
  }
  if (authAttemptsInWindow >= authenticationWindowMax) {
    const remaining = authenticationWindowMs - (now - lastAuthAttemptAt)
    if (remaining > 0)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, remaining + 100))
    authAttemptsInWindow = 0
  }
  authAttemptsInWindow += 1
  lastAuthAttemptAt = Date.now()
}

const browser = await chromium.launch({
  args:
    certification && new URL(baseUrl).hostname === 'localhost'
      ? ['--host-resolver-rules=MAP localhost 127.0.0.1']
      : [],
})
const browserRuntime = { engine: 'chromium', version: browser.version() }
const observability = createBrowserObservability({
  redact,
  expectedHttpFailure,
  expectedRequestFailure,
})
const browserEvidence = observability.evidence
const createObservedContext = (options) => observability.createObservedContext(browser, options)
const context = await createObservedContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()

const mcpProof = createMcpProof({
  baseUrl,
  page,
  story,
  redact,
  registerSecret: (secret) => registeredSecrets.add(secret),
  collection,
  fixtureToken,
  fixtureManifest,
  certification,
})

if (browserArtifactDir) await mkdir(browserArtifactDir, { recursive: true })

await writeFile(
  uploadFixturePath,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
)

try {
  if (certification) {
    await story(
      'candidate.exact-packed-consumer',
      'Browser target attests the exact packed candidate tuple',
      async () => {
        const response = await fetch(candidateAttestationUrl, {
          headers: { accept: 'application/json' },
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(`candidate attestation returned ${response.status}`)
        }
        const attestation = validateCandidateAttestation(body, candidate)
        return {
          sourceCommit: attestation.sourceCommit,
          packages: Object.fromEntries(
            Object.entries(attestation.packages).map(([name, value]) => [
              name,
              { version: value.version, commit: value.commit, sha256: value.sha256 },
            ]),
          ),
        }
      },
    )
  }

  await story(
    'auth.signed-out-protected-route',
    'Signed-out users cannot access Studio settings',
    async () => {
      const response = await fetch(`${baseUrl}/studio/settings`, { redirect: 'manual' })
      const location = response.headers.get('location') ?? ''
      if (![200, 302, 307, 308].includes(response.status)) {
        throw new Error(`unexpected status ${response.status}`)
      }
      if (response.status !== 200 && !location.includes('/studio/auth/signin')) {
        throw new Error(`redirect did not target sign-in: ${location}`)
      }
      if (response.status === 200) {
        const protectedPage = await context.newPage()
        try {
          await protectedPage.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
          await protectedPage
            .locator('[data-testid="cms-auth-form"][data-auth-ready="true"]')
            .waitFor({ timeout: 30000 })
          if (!protectedPage.url().includes('/studio/auth/signin')) {
            throw new Error(`protected route did not redirect to sign-in: ${protectedPage.url()}`)
          }
        } finally {
          await protectedPage.close()
        }
      }
      return { status: response.status, location }
    },
  )

  await story(
    'auth.invalid-credentials',
    'Invalid credentials show a sign-in failure',
    async () => {
      const invalidPage = await context.newPage()
      try {
        await invalidPage.goto(`${baseUrl}/studio/auth/signin?redirect=/studio/settings`, {
          waitUntil: 'domcontentloaded',
        })
        await invalidPage.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
          timeout: 30000,
        })
        await invalidPage.getByTestId('cms-auth-email').fill(email)
        await invalidPage.getByTestId('cms-auth-password').fill(`${password}-wrong`)
        const responsePromise = invalidPage
          .waitForResponse((response) => response.url().includes('/api/auth/sign-in/email'), {
            timeout: 30000,
          })
          .catch(() => null)
        await paceAuthAttempt()
        invalidCredentialsExpectedUntil = Date.now() + 5_000
        let response
        try {
          await invalidPage.getByTestId('cms-auth-submit').click()
          response = await responsePromise
        } finally {
          // Chromium can dispatch the generic failed-resource console event
          // just after the response promise resolves. Keep a narrow grace
          // window so that the same deliberate 4xx is classified consistently
          // in both response and console evidence.
          invalidCredentialsExpectedUntil = Math.max(
            invalidCredentialsExpectedUntil,
            Date.now() + 1_000,
          )
        }
        const errorVisible = await invalidPage
          .getByTestId('cms-auth-error')
          .isVisible()
          .catch(() => false)
        if (!response) throw new Error('sign-in response was not observed')
        if (response.ok()) throw new Error('invalid credentials unexpectedly succeeded')
        if (!errorVisible) throw new Error('invalid credentials did not show form error')
        if (!invalidPage.url().includes('/studio/auth/signin')) {
          throw new Error(`invalid credentials left sign-in page: ${invalidPage.url()}`)
        }
        return { status: response.status() }
      } finally {
        await invalidPage.close()
      }
    },
  )

  if (certification) {
    await runRoleJourneys({
      story,
      createObservedContext,
      signIn,
      baseUrl,
      fixtureManifest,
      roles: disposableRoles,
      captureScreenshot: (id, targetPage) => captureStoryScreenshot(id, '', targetPage),
    })
  }

  await story(
    'auth.sign-in-redirect',
    'Valid sign-in redirects to requested Studio route',
    async () => {
      await signIn(page, '/studio/settings')
      await expectText(page, 'Settings')
      return { url: page.url() }
    },
  )

  if (certification) {
    await story('authority.owner', 'owner receives guarded administrative access', async () => {
      for (const name of [/Settings/, /Activity log/]) {
        const link = page.getByRole('link', { name }).first()
        if (!(await link.isVisible().catch(() => false))) {
          throw new Error(`owner navigation is missing ${String(name)}`)
        }
      }
      await page.getByRole('heading', { name: /^Members(?:\s+\d+)?$/ }).waitFor({ timeout: 30000 })
      await page.getByRole('button', { name: 'Invite member' }).waitFor({ timeout: 30000 })
      await page.goto(`${baseUrl}${fixtureManifest.probes.roleEntry.path}`, {
        waitUntil: 'domcontentloaded',
      })
      const title = page.getByRole('textbox', { name: 'Title', exact: true })
      await title.waitFor({ timeout: 30000 })
      if (await title.isDisabled()) throw new Error('owner cannot edit the role probe entry')
      await page.getByRole('button', { name: /^Publish [A-Z]{2}$/ }).waitFor({ timeout: 30000 })
      return { edit: true, publish: true, settings: true, members: true }
    })
  }

  const studioState = await runStudioJourneys({
    story,
    page,
    baseUrl,
    collection,
    collectionLabel,
    fixtureTitle,
    fixtureToken,
    certification,
    fixtureManifest,
    performanceSamples,
    uploadFixturePath,
    uploadFilename,
    redact,
    signIn,
    runSiteData: async () =>
      await runSiteDataProof({
        story,
        page,
        baseUrl,
        certification,
        fixtureToken,
        fetchJson,
        redact,
      }),
  })
  fixtureEntryUrl = studioState.fixtureEntryUrl

  await runPublicJourneys({
    story,
    page,
    baseUrl,
    collection,
    fixtureToken,
    certification,
    fixtureManifest,
    fetchJson,
    redact,
  })

  await mcpProof.runStories()

  if (certification) {
    await story(
      'quality.measured-performance-budgets',
      'Target-scale performance budgets pass with repeated p95 evidence',
      async () =>
        await performanceProof.runJourney({
          context,
          page,
          createObservedContext,
          baseUrl,
          collection,
          collectionLabel,
          fixtureToken,
          fixtureManifest,
        }),
    )
  }

  await story(
    'content.fixture-cleanup',
    'Unpublishes, archives, and permanently deletes the smoke entry',
    async () => {
      if (!fixtureEntryUrl) throw new Error('fixture entry URL is unavailable')
      await page.goto(fixtureEntryUrl, { waitUntil: 'domcontentloaded' })
      await page.getByText(fixtureTitle, { exact: true }).first().waitFor({ timeout: 30000 })

      const entryActions = page.getByRole('button', { name: `Entry actions for ${fixtureTitle}` })
      await entryActions.click()
      const unpublish = page.getByRole('menuitem', { name: 'Unpublish' })
      if ((await unpublish.count()) === 1) {
        await unpublish.click()
        const dialog = page.getByRole('dialog', { name: 'Unpublish' })
        await dialog.waitFor({ timeout: 30000 })
        await dialog.getByRole('button', { name: 'Unpublish' }).click()
        await page
          .locator('.studio-entry-topbar')
          .getByText('Draft', { exact: true })
          .waitFor({ timeout: 30000 })
      }

      await entryActions.click()
      await page.getByRole('menuitem', { name: 'Archive' }).click()
      const archiveDialog = page.getByRole('dialog', { name: 'Archive' })
      await archiveDialog.waitFor({ timeout: 30000 })
      await archiveDialog.getByRole('button', { name: 'Archive' }).click()
      await page.waitForURL(new RegExp(`/studio/content/${collection}/?$`), { timeout: 30000 })

      await page.goto(fixtureEntryUrl, { waitUntil: 'domcontentloaded' })
      await page.getByText(fixtureTitle, { exact: true }).first().waitFor({ timeout: 30000 })
      await page.getByRole('button', { name: `Entry actions for ${fixtureTitle}` }).click()
      await page.getByRole('menuitem', { name: 'Permanently delete entry' }).click()

      const prompt = page.getByRole('dialog', { name: 'Permanently delete archived entry' })
      await prompt.waitFor({ timeout: 30000 })
      const confirmationInput = prompt.getByRole('textbox', { name: 'Confirmation phrase' })
      const confirmationPhrase = await confirmationInput.getAttribute('placeholder')
      if (!confirmationPhrase?.startsWith('DELETE ')) {
        throw new Error('Permanent-delete confirmation phrase is unavailable.')
      }
      await confirmationInput.fill(confirmationPhrase)
      await prompt.getByRole('button', { name: 'Review deletion' }).click()
      await prompt.waitFor({ state: 'hidden', timeout: 30000 })

      const confirm = page.getByRole('dialog', { name: 'Permanently delete archived entry' })
      await confirm.waitFor({ timeout: 30000 })
      await confirm.getByTestId('cms-confirm-dialog-confirm').click()
      await page.waitForURL(new RegExp(`/studio/content/${collection}/?$`), { timeout: 30000 })
      return { archived: true, permanentlyDeleted: true }
    },
  )

  await story(
    'auth.sign-out-protected-access-lost',
    'Signed-in users can sign out and lose Studio access',
    async () => {
      await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: 30000 })
      const userMenu = page.locator('button').filter({ hasText: email })
      const userMenuCount = await userMenu.count()
      if (userMenuCount !== 1) throw new Error(`expected one user menu, found ${userMenuCount}`)
      await userMenu.click()
      const signOutItem = page.getByText('Sign out', { exact: true })
      const signOutCount = await signOutItem.count()
      if (signOutCount !== 1) throw new Error(`expected one sign-out item, found ${signOutCount}`)
      await signOutItem.click()
      await page.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
        timeout: 30000,
      })
      if (!page.url().includes('/studio/auth/signin')) {
        throw new Error(`sign-out did not return to sign-in: ${page.url()}`)
      }
      await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
      await page.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
        timeout: 30000,
      })
      if (!page.url().includes('/studio/auth/signin')) {
        throw new Error(`protected route remained accessible after sign-out: ${page.url()}`)
      }
      return { url: page.url() }
    },
  )
} finally {
  const mcpCleanup = await mcpProof.cleanup()
  results.push(...mcpCleanup.failures)
  await browser.close()
  localUploadFixtureRemoved = await unlink(uploadFixturePath).then(
    () => true,
    () => false,
  )
  const entryCleanupEvidence = results.find(
    (result) => result.id === 'content.fixture-cleanup' && result.status === 'passed',
  )?.evidence
  const cleanup = {
    fixturePrefix,
    entryArchived: entryCleanupEvidence?.archived === true,
    entryDeleted: entryCleanupEvidence?.permanentlyDeleted === true,
    assetRetired: results.some(
      (result) => result.id === 'assets.upload-and-trash' && result.status === 'passed',
    ),
    siteDataDeleted:
      !certification ||
      results.some(
        (result) =>
          result.id === 'site-data.localized-public-lifecycle' && result.status === 'passed',
      ),
    ...mcpCleanup.status,
    localUploadFixtureRemoved,
    deploymentDiscardStillRequired: true,
  }
  const unexpectedBrowserFailures =
    browserEvidence.console.length +
    browserEvidence.pageErrors.length +
    browserEvidence.requestFailures.length +
    browserEvidence.httpFailures.length
  if (unexpectedBrowserFailures > 0) {
    results.push({
      id: 'browser.observability',
      title: 'No unexpected console, page, request, or HTTP failures',
      status: 'failed',
      durationMs: 0,
      error: `${unexpectedBrowserFailures} unexpected browser failure(s) were recorded.`,
    })
  }
  if (browserArtifactDir) {
    await writeFile(
      resolve(browserArtifactDir, 'console-network-summary.json'),
      `${JSON.stringify({ browserRuntime, unexpectedBrowserFailures, ...browserEvidence }, null, 2)}\n`,
    )
    const journeyCleanupOutput = process.env.CMS_STORY_JOURNEY_CLEANUP_OUTPUT
      ? resolve(process.env.CMS_STORY_JOURNEY_CLEANUP_OUTPUT)
      : resolve(browserArtifactDir, 'journey-cleanup.json')
    await writeFile(journeyCleanupOutput, `${JSON.stringify(cleanup, null, 2)}\n`)
    if (certification) {
      const metricResults = Object.values(performanceEvidence.metrics)
      await writeFile(
        resolve(browserArtifactDir, 'performance-summary.json'),
        `${JSON.stringify(
          {
            ...performanceEvidence,
            ok:
              metricResults.length === 8 &&
              metricResults.every((metric) => metric.passed === true) &&
              performanceSampleCount >= 20,
          },
          null,
          2,
        )}\n`,
      )
    }
  }
  if (outputPath) {
    const failed = results.filter((result) => result.status !== 'passed')
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          ok: failed.length === 0,
          baseUrl,
          stories: results.length,
          cleanup,
          browser: {
            runtime: browserRuntime,
            unexpectedFailures: unexpectedBrowserFailures,
            screenshots: browserEvidence.screenshots,
          },
          results,
        },
        null,
        2,
      )}\n`,
    )
  }
}

const failed = results.filter((result) => result.status !== 'passed')
if (failed.length) {
  console.error(JSON.stringify({ ok: false, baseUrl, results }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, baseUrl, stories: results.length, results }, null, 2))
