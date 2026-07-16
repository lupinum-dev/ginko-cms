#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoEnvFile = resolve(repoRoot, '.env.local')
if (existsSync(repoEnvFile)) loadEnvFile(repoEnvFile)

const defaultConsumerDir = resolve(repoRoot, 'playground')
const args = process.argv.slice(2)
const openBrowser = args.includes('--open')
const studioOnly = args.includes('--studio-only')
const explicitConsumerDir = args.find((arg) => !arg.startsWith('--'))
const consumerDir = resolve(
  explicitConsumerDir ?? process.env.GINKO_CMS_CONSUMER_DIR ?? defaultConsumerDir,
)
const consumerUrl = process.env.GINKO_CMS_CONSUMER_URL ?? 'http://localhost:3000'
const consumerUrlParts = new URL(consumerUrl)
const studioHost = process.env.GINKO_STUDIO_HOST ?? '127.0.0.1'
const studioStartPort = Number(process.env.GINKO_STUDIO_PORT ?? 5252)

if (args.includes('--help')) {
  console.log(`Usage: pnpm dev:consumer [consumer-dir] [--open]

Runs the Studio SPA from this checkout and starts a consumer Nuxt app with
GINKO_STUDIO_DEV_SERVER injected.

Options:
  --open         Open the consumer Studio URL after startup.
  --studio-only Run only the Studio Vite server. Use this only when the
                consumer dev server was already started with
                GINKO_STUDIO_DEV_SERVER set.

Environment:
  .env.local               Loaded from the Ginko CMS repository when present.
  GINKO_CMS_CONSUMER_DIR   Consumer app directory. Default: ${defaultConsumerDir}
  GINKO_CMS_CONSUMER_URL   Consumer URL for printed/opened links. Default: ${consumerUrl}
  GINKO_STUDIO_HOST        Studio Vite host. Default: ${studioHost}
  GINKO_STUDIO_PORT        Preferred Studio Vite port. Default: ${studioStartPort}
`)
  process.exit(0)
}

if (!existsSync(resolve(consumerDir, 'package.json'))) {
  console.error(`[dev:consumer] Consumer package.json not found: ${consumerDir}`)
  process.exit(1)
}

function isPortFree(port, host = studioHost) {
  return new Promise((resolvePort) => {
    const server = createServer()
    server.once('error', () => resolvePort(false))
    server.once('listening', () => {
      server.close(() => resolvePort(true))
    })
    server.listen(port, studioHost)
  })
}

async function isConsumerPortFree(consumerUrlParts) {
  const consumerPort = Number(
    consumerUrlParts.port || (consumerUrlParts.protocol === 'https:' ? 443 : 80),
  )
  if (!consumerPort) return true
  const hosts =
    consumerUrlParts.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [consumerUrlParts.hostname]
  for (const host of hosts) {
    if (!(await isPortFree(consumerPort, host))) return false
  }
  return true
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`No free Studio dev-server port found from ${startPort} to ${startPort + 19}.`)
}

function run(label, command, commandArgs, options) {
  console.log(`[${label}] ${command} ${commandArgs.join(' ')}`)
  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    ...options,
  })
  child.on('error', (error) => {
    console.error(`[${label}] failed to start:`, error)
  })
  return child
}

function terminate(children) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGINT')
  }
}

const studioPort = await findFreePort(studioStartPort)
const studioDevServer = `http://localhost:${studioPort}`
const studioPackageDir = resolve(repoRoot, 'packages/cms')
const children = []
let shuttingDown = false

if (!studioOnly) {
  if (!(await isConsumerPortFree(consumerUrlParts))) {
    console.error(`[dev:consumer] ${consumerUrl} is already in use.`)
    console.error(
      '[dev:consumer] Stop the existing consumer dev server and rerun this command so Nuxt starts with GINKO_STUDIO_DEV_SERVER.',
    )
    console.error(
      `[dev:consumer] If that server was already started with GINKO_STUDIO_DEV_SERVER=${studioDevServer}, run: pnpm dev:consumer --studio-only`,
    )
    process.exit(1)
  }
}

console.log(`[dev:consumer] Consumer: ${consumerDir}`)
console.log(`[dev:consumer] Studio HMR: ${studioDevServer}`)
console.log(`[dev:consumer] Open: ${consumerUrl.replace(/\/$/, '')}/studio`)
console.log(
  '[dev:consumer] Studio UI edits hot-reload from packages/cms/studio-app/src; module/runtime changes still require rebuilding the package used by the consumer.',
)

children.push(
  run(
    'studio',
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      'studio-app/vite.config.ts',
      '--host',
      studioHost,
      '--port',
      String(studioPort),
    ],
    {
      cwd: studioPackageDir,
      env: process.env,
    },
  ),
)

if (!studioOnly) {
  children.push(
    run('consumer', 'pnpm', ['dev'], {
      cwd: consumerDir,
      env: {
        ...process.env,
        GINKO_STUDIO_DEV_SERVER: studioDevServer,
        HOST: consumerUrlParts.hostname === 'localhost' ? '127.0.0.1' : consumerUrlParts.hostname,
        PORT: String(
          Number(consumerUrlParts.port || (consumerUrlParts.protocol === 'https:' ? 443 : 80)),
        ),
      },
    }),
  )
}

if (openBrowser) {
  const target = `${consumerUrl.replace(/\/$/, '')}/studio`
  setTimeout(() => {
    const opener =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    spawn(opener, [target], { stdio: 'ignore', shell: process.platform === 'win32' })
  }, 2500)
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    shuttingDown = true
    terminate(children.filter((candidate) => candidate !== child))
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    terminate(children)
  })
}
