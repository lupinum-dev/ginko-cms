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
    `  ${commandName} deploy [--check] [--cwd <path>] [-- <convex args...>]`,
    `  ${commandName} backup export --scope full|collection|entry|asset --out <file> [--collection-id <id>] [--entry-id <id>] [--asset-id <id>] [--cwd <path>]`,
    `  ${commandName} backup verify --artifact-id <id> [--cwd <path>]`,
    `  ${commandName} backup download --artifact-id <id> --out <file> [--cwd <path>]`,
    `  ${commandName} migrate create <name> [--cwd <path>]`,
    `  ${commandName} migrate list [--cwd <path>]`,
    `  ${commandName} migrate plan <file> [--cwd <path>]`,
    `  ${commandName} migrate apply <file> --yes [--cwd <path>]`,
    `  ${commandName} convex [...args] [--cwd <path>]`,
    `  ${commandName} doctor [--cwd <path>]`,
    `  ${commandName} mcp-doctor [--cwd <path>]`,
    '',
    '`init` writes missing direct Convex setup files. `doctor` validates setup and stale generated bridge files.',
    'The convex command proxies the Convex CLI bundled with Ginko CMS.',
    'Backup commands call the installed CMS backup actions. Restore/import is not available until round-trip coverage exists.',
    'Migration commands scaffold, inspect, and apply explicit project content migrations.',
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
