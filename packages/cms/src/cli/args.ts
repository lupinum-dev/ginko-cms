import { resolve } from 'node:path'

import type { ConvexHttpClient } from 'convex/browser'

export type CliWriter = {
  write(value: string): unknown
}

export type CliIo = {
  stdout?: CliWriter
  stderr?: CliWriter
}

export type ParsedArgs = {
  args: string[]
  cwd: string
}

export type CliRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<number>

export type ConvexClientLike = Pick<ConvexHttpClient, 'action' | 'query' | 'mutation'> & {
  setAuth?: (token: string) => void
  setAdminAuth?: (token: string, actingAsIdentity?: unknown) => void
}

export type ConvexClientFactory = (url: string) => ConvexClientLike

export const commandName = 'ginko-cms'

export function write(stream: CliWriter | undefined, value: string) {
  stream?.write(value)
}

export function parseArgs(rawArgs: string[], fallbackCwd: string): ParsedArgs {
  const args = [...rawArgs]
  let cwd = fallbackCwd

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--cwd') {
      const next = args[index + 1]
      if (!next) throw new Error('--cwd requires a path.')
      cwd = resolvePath(next)
      args.splice(index, 2)
      index -= 1
      continue
    }
    if (value?.startsWith('--cwd=')) {
      cwd = resolvePath(value.slice('--cwd='.length))
      args.splice(index, 1)
      index -= 1
    }
  }

  return { args, cwd: resolvePath(cwd) }
}

export function usage(): string {
  return [
    'Ginko CMS CLI',
    '',
    'Usage:',
    `  ${commandName} init [--cwd <path>]`,
    `  ${commandName} push [--check] [--cwd <path>]`,
    `  ${commandName} deploy [--check | --transition] [--cwd <path>] [-- <convex args...>]`,
    `  ${commandName} contract transition create <name> [--cwd <path>]`,
    `  ${commandName} contract transition list [--cwd <path>]`,
    `  ${commandName} contract transition stage <file> --yes [--cwd <path>]`,
    `  ${commandName} contract transition status <run-id> [--cwd <path>]`,
    `  ${commandName} contract transition apply <run-id> --yes [--cwd <path>]`,
    `  ${commandName} contract transition activate <run-id> --yes [--cwd <path>]`,
    `  ${commandName} contract transition cancel <run-id> --yes [--cwd <path>]`,
    `  ${commandName} content export --out <directory> [--collections <slug,...>] [--cwd <path>]`,
    `  ${commandName} content verify <directory> [--cwd <path>]`,
    `  ${commandName} content import <directory> --plan <file> [--cwd <path>]`,
    `  ${commandName} content import --apply <plan-file> [--cwd <path>]`,
    `  ${commandName} content status <run-id> [--items <failed|blocked|skipped|all>] [--cwd <path>]`,
    `  ${commandName} content resume <run-id> [--cwd <path>]`,
    `  ${commandName} repair start <run-id> [--page-size <1-25>] [--manual] [--cwd <path>]`,
    `  ${commandName} repair status <run-id> [--cwd <path>]`,
    `  ${commandName} repair resume <run-id> [--manual] [--cwd <path>]`,
    `  ${commandName} asset cleanup list [--cwd <path>]`,
    `  ${commandName} asset cleanup retry <task-id> --generation <n> --yes [--cwd <path>]`,
    `  ${commandName} asset recovery create <asset-id> [--cwd <path>]`,
    `  ${commandName} asset recovery download <artifact-id> --out <file> [--cwd <path>]`,
    `  ${commandName} asset recovery verify <artifact-id> [--cwd <path>]`,
    `  ${commandName} asset recovery preview <artifact-id> [--cwd <path>]`,
    `  ${commandName} asset recovery restore <artifact-id> --checksum <sha256> --yes [--cwd <path>]`,
    `  ${commandName} convex [...args] [--cwd <path>]`,
    `  ${commandName} doctor [--deployment] [--cwd <path>]`,
    `  ${commandName} mcp-doctor [--cwd <path>]`,
    '',
    '`init` writes missing Convex setup files and CMS root adapters. `doctor` diagnoses setup, auth, provider, contract, and generated-file drift; `doctor --deployment` also checks backend reachability.',
    'The convex command proxies the Convex CLI bundled with Ginko CMS.',
    'Contract transition commands stage, inspect, resume, activate, or cancel a bounded owner-only contract cutover.',
    'Content commands export published revisions, verify portable directories, plan or apply draft-only imports, and inspect or resume durable runs.',
    'Repair commands rebuild and verify derived public/search rows and content-to-asset references through one durable owner-only run.',
    'Asset cleanup commands inspect and generation-fence retries for terminal abandoned-upload cleanup failures.',
    'Asset recovery commands create, verify, download, preview, and checksum-confirm exact-byte recovery artifacts.',
    '',
  ].join('\n')
}

export function readFlag(args: string[], name: string): string | undefined {
  const exactIndex = args.indexOf(name)
  if (exactIndex >= 0) return args[exactIndex + 1]
  const prefixed = args.find((value) => value.startsWith(`${name}=`))
  return prefixed ? prefixed.slice(name.length + 1) : undefined
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name) || args.some((value) => value.startsWith(`${name}=`))
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function resolvePath(path: string): string {
  return resolve(path)
}
