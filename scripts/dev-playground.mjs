#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = resolve(repoRoot, '.env.local')
if (!existsSync(envFile)) {
  throw new Error('Run `better-convex convex deployment select local` before starting development.')
}
loadEnvFile(envFile)

const clientEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('CONVEX_')),
)
clientEnvironment.NUXT_PUBLIC_CONVEX_URL =
  process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL
clientEnvironment.NUXT_PUBLIC_CONVEX_SITE_URL =
  process.env.NUXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.VITE_CONVEX_SITE_URL ??
  process.env.CONVEX_SITE_URL

if (!clientEnvironment.NUXT_PUBLIC_CONVEX_URL) {
  throw new Error('The selected deployment does not provide a public Convex URL.')
}

function runPreparation(script) {
  const result = spawnSync('pnpm', ['run', script], {
    cwd: repoRoot,
    env: clientEnvironment,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

runPreparation('build')
runPreparation('prepare:playground')

const children = [
  spawn('better-convex', ['convex', 'dev', '--typecheck', 'disable', '--tail-logs', 'disable'], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn('nuxi', ['dev', '--cwd', 'playground'], {
    cwd: repoRoot,
    env: clientEnvironment,
    stdio: 'inherit',
  }),
]

let stopping = false
function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = exitCode
}

for (const child of children) {
  child.once('error', (error) => {
    console.error(error)
    stop(1)
  })
  child.once('exit', (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0))
  })
}

process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())
