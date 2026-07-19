import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ConvexHttpClient } from 'convex/browser'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const convexBin = resolve(repoRoot, 'node_modules/.bin/convex')
const convexCwd = resolve(repoRoot, 'playground')
const adminKey =
  process.env.CONVEX_DEPLOY_KEY?.trim() || process.env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim()
const convexUrl = process.env.CONVEX_URL?.trim() || process.env.CONVEX_SELF_HOSTED_URL?.trim()
const deployment = process.env.CONVEX_DEPLOYMENT?.trim()
if ((!adminKey || !convexUrl) && !deployment) {
  throw new Error('A disposable Convex deployment or URL plus deployment admin key is required.')
}
const command = process.argv[2]
const options = parseArgs(process.argv.slice(3))

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function parseArgs(args) {
  const result = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith('--') || value === undefined)
      throw new Error('Fixture arguments are invalid.')
    result[key.slice(2)] = value
  }
  return result
}

function requiredOption(name) {
  const value = options[name]
  if (!value) throw new Error(`--${name} is required.`)
  return value
}

function runCli(args) {
  execFileSync(convexBin, args, {
    cwd: convexCwd,
    env: process.env,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
}

function readDeploymentEnv(name) {
  return execFileSync(convexBin, ['env', 'get', name], {
    cwd: convexCwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

async function runComponent(component, functionName, args, identity) {
  const actingAs = identity
    ? {
        issuer: 'https://convex.test',
        tokenIdentifier: `https://convex.test|${identity.subject}`,
        ...identity,
      }
    : undefined
  if (adminKey && convexUrl) {
    const client = new ConvexHttpClient(convexUrl)
    client.setAdminAuth(adminKey, actingAs)
    return await client.function(functionName, component, args)
  }
  const cliArgs = [
    'run',
    functionName,
    JSON.stringify(args),
    '--deployment',
    deployment.replace(/^[^:]+:/u, ''),
  ]
  if (component) cliArgs.push('--component', component)
  if (actingAs) cliArgs.push('--identity', JSON.stringify(actingAs))
  const output = execFileSync(convexBin, cliArgs, {
    cwd: convexCwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  return JSON.parse(output)
}

function setFixtureGate(prefix) {
  runCli(['env', 'set', 'GINKO_CMS_LIVE_FIXTURES', '1'])
  runCli(['env', 'set', 'GINKO_CMS_LIVE_FIXTURE_PREFIX', prefix])
  if (
    readDeploymentEnv('GINKO_CMS_LIVE_FIXTURES') !== '1' ||
    readDeploymentEnv('GINKO_CMS_LIVE_FIXTURE_PREFIX') !== prefix
  ) {
    throw new Error('Live fixture administration is disabled for this deployment.')
  }
}

function removeFixtureGate() {
  runCli(['env', 'remove', 'GINKO_CMS_LIVE_FIXTURES'])
  runCli(['env', 'remove', 'GINKO_CMS_LIVE_FIXTURE_PREFIX'])
}

async function roleAccounts(prefix) {
  const accounts = []
  for (const role of ['viewer', 'editor', 'publisher', 'owner']) {
    const envPrefix = `GINKO_CMS_TEST_${role.toUpperCase()}`
    const email = requiredEnv(`${envPrefix}_EMAIL`).toLowerCase()
    if (!email.includes(prefix.toLowerCase())) {
      throw new Error(`${envPrefix}_EMAIL must contain the unique fixture prefix.`)
    }
    const user = await runComponent('betterAuth', 'adapter:findOne', {
      model: 'user',
      where: [{ field: 'email', value: email }],
    })
    if (!user?.id) throw new Error(`Disposable Better Auth account is missing for ${role}.`)
    accounts.push({ role, email, userId: user.id })
  }
  return accounts
}

async function ensureReview(prefix, owner, probes) {
  const existing = await runComponent('ginkoCms', 'liveFixtures/cleanup:findPendingReview', {
    prefix,
    title: probes.reviewTitle,
  })
  if (existing) return existing
  return await runComponent(
    undefined,
    'ginkoCms/reviewRequests:requestPublishReview',
    {
      entryId: probes.reviewEntryId,
      locales: ['en', 'de'],
      expectedVersion: probes.reviewVersion,
      message: `${prefix} localized publish-all proof`,
      title: probes.reviewTitle,
      summary: `${prefix} review fixture`,
    },
    {
      subject: owner.userId,
      email: owner.email,
      emailVerified: true,
      token_use: 'convex-session',
    },
  )
}

async function setup() {
  const output = resolve(requiredOption('output'))
  const prefix = requiredOption('prefix')
  const targetScale = JSON.parse(requiredOption('target-scale'))
  setFixtureGate(prefix)
  const members = await roleAccounts(prefix)
  await runComponent('ginkoCms', 'liveFixtures:setupMembers', { prefix, members })
  for (let start = 0; start < targetScale.entries; start += 100) {
    await runComponent('ginkoCms', 'liveFixtures:setupEntriesPage', { prefix, start, count: 100 })
  }
  let storageId = await runComponent('ginkoCms', 'liveFixtures:findAssetStorageId', { prefix })
  if (!storageId) {
    const createdStorageIds = await runComponent('ginkoCms', 'liveFixtures:createStoragePage', {
      prefix,
      start: 0,
      count: 1,
    })
    storageId = createdStorageIds[0] ?? null
  }
  if (!storageId) throw new Error('Disposable fixture storage object was not created.')
  for (let start = 0; start < targetScale.assets; start += 100) {
    const count = Math.min(100, targetScale.assets - start)
    await runComponent('ginkoCms', 'liveFixtures:setupAssetsPage', {
      prefix,
      start,
      count,
      storageIds: Array(count).fill(storageId),
    })
  }
  const probes = await runComponent('ginkoCms', 'liveFixtures:setupProbes', { prefix })
  const inspection = await runComponent('ginkoCms', 'liveFixtures:inspect', { prefix })
  await ensureReview(
    prefix,
    members.find(({ role }) => role === 'owner'),
    probes,
  )
  const counts = await runComponent('ginkoCms', 'liveFixtures/cleanup:counts', { prefix })
  let publicRows = 0
  for (const locale of ['en', 'de', 'fr']) {
    publicRows += await runComponent('ginkoCms', 'liveFixtures:countPublicLocale', {
      prefix,
      locale,
    })
  }
  if (
    counts.entries !== targetScale.entries ||
    counts.assets !== targetScale.assets ||
    counts.members !== 4 ||
    publicRows !== targetScale.publicRows
  ) {
    throw new Error(
      `Disposable live fixture counts do not match the requested target scale: ${JSON.stringify({
        actual: { ...counts, publicRows },
        expected: {
          entries: targetScale.entries,
          assets: targetScale.assets,
          members: 4,
          publicRows: targetScale.publicRows,
        },
      })}`,
    )
  }
  const mismatchUrl = requiredEnv('CMS_STORY_CONTRACT_MISMATCH_URL')
  const deepestPath = `/docs/${inspection.deepestSlugPath.join('/')}`
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        fixturePrefix: prefix,
        targetScale,
        localeCodes: ['en', 'de', 'fr'],
        probes: {
          entryPagination: {
            collection: inspection.collection,
            query: `${prefix} page`,
            terminalTitle: inspection.terminalPaginationTitle,
            expectedRows: targetScale.paginationRows,
          },
          deepSearch: {
            collection: inspection.collection,
            query: `${prefix} deep terminal`,
            expectedTitle: inspection.deepSearchTitle,
          },
          assetSearch: { query: prefix, expectedFilename: inspection.assetTerminalFilename },
          roleEntry: {
            path: `/studio/content/${inspection.collection}/${inspection.roleEntryId}`,
            title: `${prefix} page 0000 en`,
            bodyBytes: targetScale.longMdcBytes,
          },
          routeRedirect: {
            sourcePath: probes.redirectSourcePath,
            targetPath: probes.redirectTargetPath,
          },
          pendingReview: {
            title: probes.reviewTitle,
            localeCodes: ['en', 'de'],
            publicPaths: { en: probes.reviewPublicPath, de: `/de${probes.reviewPublicPath}` },
          },
          mcpReview: {
            entryId: inspection.mcpEntryId,
            locale: 'en',
            reviewTitle: `${prefix} MCP review`,
            expectedVersion: inspection.mcpDraftVersion,
          },
          publicRoutes: {
            deepestPath,
            expectedRows: targetScale.publicRows,
            pathPrefixes: [`/docs/${prefix}`, `/de/docs/${prefix}`, `/fr/docs/${prefix}`],
          },
          contractMismatchUrl: mismatchUrl,
        },
        cleanupExpected: { storageIds: [storageId] },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
}

async function cleanup({ removeBootstrapOwner }) {
  const output = resolve(requiredOption('output'))
  const prefix = requiredOption('prefix')
  setFixtureGate(prefix)
  for (const phase of ['mcp', 'redirects', 'siteData']) {
    while (true) {
      const result = await runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupControlPage', {
        prefix,
        phase,
        count: 100,
      })
      if (result.complete) break
    }
  }
  while (true) {
    const result = await runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupEntriesPage', {
      prefix,
      count: 50,
    })
    if (result.complete) break
  }
  const storageIds = new Set()
  while (true) {
    const result = await runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupAssetsPage', {
      prefix,
      count: 100,
    })
    for (const storageId of result.storageIds) storageIds.add(storageId)
    if (result.complete) break
  }
  for (const storageId of storageIds) {
    await runComponent('ginkoCms', 'liveFixtures/cleanup:deleteStorage', { prefix, storageId })
  }
  const beforeMemberCleanup = await runComponent('ginkoCms', 'liveFixtures/cleanup:counts', {
    prefix,
  })
  if (beforeMemberCleanup.mcpConnections !== 0) {
    throw new Error('Disposable MCP credentials remain after fixture cleanup.')
  }
  const bootstrapOwnerCleanup = removeBootstrapOwner
    ? await runComponent('ginkoCms', 'liveFixtures/finalize:cleanupBootstrapOwner', {
        prefix,
        configuredOwnerEmail: readDeploymentEnv('GINKO_FIRST_OWNER_EMAIL'),
      })
    : { deleted: 0, credentials: 0, agentRuns: 0 }
  while (true) {
    const result = await runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupControlPage', {
      prefix,
      phase: 'members',
      count: 100,
    })
    if (result.complete) break
  }
  const fixtureRemaining = await runComponent('ginkoCms', 'liveFixtures/cleanup:counts', {
    prefix,
  })
  const globalRemaining = await runComponent('ginkoCms', 'liveFixtures/finalize:globalCounts', {
    prefix,
  })
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        fixturePrefix: prefix,
        deploymentDiscarded: false,
        remaining: globalRemaining,
        fixtureRemaining,
        globalRemaining,
        removed: { storageObjects: storageIds.size, bootstrapOwner: bootstrapOwnerCleanup },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
  if (Object.values(globalRemaining).every((count) => count === 0)) removeFixtureGate()
}

if (command === 'setup') await setup()
else if (command === 'cleanup') await cleanup({ removeBootstrapOwner: false })
else if (command === 'cleanup-final') await cleanup({ removeBootstrapOwner: true })
else throw new Error('Fixture command must be setup, cleanup, or cleanup-final.')
