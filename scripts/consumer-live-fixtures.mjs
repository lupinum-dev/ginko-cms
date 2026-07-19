import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const convexBin = resolve(repoRoot, 'node_modules/.bin/convex')
const convexCwd = resolve(repoRoot, 'playground')
const deployment = requiredEnv('CONVEX_DEPLOYMENT')
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

function runCli(args, { capture = true } = {}) {
  return execFileSync(convexBin, [...args, '--deployment', deployment], {
    cwd: convexCwd,
    env: process.env,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

function runComponent(component, functionName, args, identity) {
  const commandArgs = [
    'run',
    '--component',
    component,
    functionName,
    JSON.stringify(args),
    ...(identity ? ['--identity', JSON.stringify(identity)] : []),
  ]
  const output = runCli(commandArgs).trim()
  return output ? JSON.parse(output) : null
}

function runInlineQuery(component, source) {
  const output = runCli(['run', '--component', component, '--inline-query', source]).trim()
  return output ? JSON.parse(output) : null
}

function setFixtureGate(prefix) {
  runCli(['env', 'set', 'GINKO_CMS_LIVE_FIXTURES', '1'], { capture: false })
  runCli(['env', 'set', 'GINKO_CMS_LIVE_FIXTURE_PREFIX', prefix], { capture: false })
}

function removeFixtureGate() {
  runCli(['env', 'remove', 'GINKO_CMS_LIVE_FIXTURES'], { capture: false })
  runCli(['env', 'remove', 'GINKO_CMS_LIVE_FIXTURE_PREFIX'], { capture: false })
}

function roleAccounts(prefix) {
  return ['viewer', 'editor', 'publisher', 'owner'].map((role) => {
    const envPrefix = `GINKO_CMS_TEST_${role.toUpperCase()}`
    const email = requiredEnv(`${envPrefix}_EMAIL`).toLowerCase()
    if (!email.includes(prefix.toLowerCase())) {
      throw new Error(`${envPrefix}_EMAIL must contain the unique fixture prefix.`)
    }
    const user = runInlineQuery(
      'betterAuth',
      `await ctx.db.query("user").withIndex("email", q => q.eq("email", ${JSON.stringify(email)})).unique()`,
    )
    if (!user?.id) throw new Error(`Disposable Better Auth account is missing for ${role}.`)
    return { role, email, userId: user.id }
  })
}

function ensureReview(prefix, owner, probes) {
  const existing = runInlineQuery(
    'ginkoCms',
    `const rows = await ctx.db.query("reviewRequests").withIndex("by_status", q => q.eq("status", "pending")).collect(); return rows.find(row => row.title === ${JSON.stringify(probes.reviewTitle)}) ?? null`,
  )
  if (existing) return existing
  return runComponent(
    'ginkoCms',
    'reviewRequests:requestPublishReview',
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

function setup() {
  const output = resolve(requiredOption('output'))
  const prefix = requiredOption('prefix')
  const targetScale = JSON.parse(requiredOption('target-scale'))
  setFixtureGate(prefix)
  const members = roleAccounts(prefix)
  runComponent('ginkoCms', 'liveFixtures:setupMembers', { prefix, members })
  for (let start = 0; start < targetScale.entries; start += 100) {
    runComponent('ginkoCms', 'liveFixtures:setupEntriesPage', { prefix, start, count: 100 })
  }
  const storageIds = []
  for (let start = 0; start < targetScale.assets; start += 100) {
    const pageStorageIds = runComponent('ginkoCms', 'liveFixtures:createStoragePage', {
      prefix,
      start,
      count: Math.min(100, targetScale.assets - start),
    })
    storageIds.push(...pageStorageIds)
    runComponent('ginkoCms', 'liveFixtures:setupAssetsPage', {
      prefix,
      start,
      count: pageStorageIds.length,
      storageIds: pageStorageIds,
    })
  }
  const probes = runComponent('ginkoCms', 'liveFixtures:setupProbes', { prefix })
  const inspection = runComponent('ginkoCms', 'liveFixtures:inspect', { prefix })
  ensureReview(
    prefix,
    members.find(({ role }) => role === 'owner'),
    probes,
  )
  const counts = runComponent('ginkoCms', 'liveFixtures/cleanup:counts', { prefix })
  const publicRows = ['en', 'de', 'fr'].reduce(
    (total, locale) =>
      total + runComponent('ginkoCms', 'liveFixtures:countPublicLocale', { prefix, locale }),
    0,
  )
  if (
    counts.entries !== targetScale.entries ||
    counts.assets !== targetScale.assets ||
    counts.members !== 4 ||
    publicRows !== targetScale.publicRows
  ) {
    throw new Error('Disposable live fixture counts do not match the requested target scale.')
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
        cleanupExpected: { storageIds },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
}

function cleanup() {
  const output = resolve(requiredOption('output'))
  const prefix = requiredOption('prefix')
  setFixtureGate(prefix)
  for (const phase of ['mcp', 'redirects', 'siteData']) {
    while (true) {
      const result = runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupControlPage', {
        prefix,
        phase,
        count: 100,
      })
      if (result.complete) break
    }
  }
  while (true) {
    const result = runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupEntriesPage', {
      prefix,
      count: 50,
    })
    if (result.complete) break
  }
  const storageIds = new Set()
  while (true) {
    const result = runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupAssetsPage', {
      prefix,
      count: 100,
    })
    for (const storageId of result.storageIds) storageIds.add(storageId)
    if (result.complete) break
  }
  for (const storageId of storageIds) {
    runComponent('ginkoCms', 'liveFixtures/cleanup:deleteStorage', { prefix, storageId })
  }
  const beforeMemberCleanup = runComponent('ginkoCms', 'liveFixtures/cleanup:counts', { prefix })
  if (beforeMemberCleanup.mcpConnections !== 0) {
    throw new Error('Disposable MCP credentials remain after fixture cleanup.')
  }
  while (true) {
    const result = runComponent('ginkoCms', 'liveFixtures/cleanup:cleanupControlPage', {
      prefix,
      phase: 'members',
      count: 100,
    })
    if (result.complete) break
  }
  const remaining = runComponent('ginkoCms', 'liveFixtures/cleanup:counts', { prefix })
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        fixturePrefix: prefix,
        deploymentDiscarded: false,
        remaining,
        removed: { storageObjects: storageIds.size },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
  if (Object.values(remaining).every((count) => count === 0)) removeFixtureGate()
}

if (command === 'setup') setup()
else if (command === 'cleanup') cleanup()
else throw new Error('Fixture command must be setup or cleanup.')
