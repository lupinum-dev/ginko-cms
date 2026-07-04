#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { type CliRunner, type ConvexClientFactory, parseArgs, usage, write } from './args.js'
import { runBackupCommand } from './backup.js'
import { resolveConvexCliBin, runNodeScript } from './convex.js'
import { runDeployCommand } from './deploy.js'
import { runDoctorCommand } from './doctor.js'
import { runInitCommand } from './init.js'
import { runMcpDoctor } from './mcp-doctor.js'
import { runMigrateCommand } from './migrate.js'
import { runPushCommand } from './push.js'

export async function runGinkoCmsCli(
  rawArgs: string[],
  options: {
    cwd?: string
    io?: {
      stdout?: { write(value: string): unknown }
      stderr?: { write(value: string): unknown }
    }
    runner?: CliRunner
    convexClientFactory?: ConvexClientFactory
  } = {},
): Promise<number> {
  const io = {
    stdout: options.io?.stdout ?? process.stdout,
    stderr: options.io?.stderr ?? process.stderr,
  }
  const parsed = parseArgs(rawArgs, options.cwd ?? process.cwd())
  const [command] = parsed.args

  try {
    if (!command || ['--help', '-h'].includes(command)) {
      write(io.stdout, usage())
      return 0
    }

    if (command === 'setup') {
      throw new Error('`ginko-cms setup` was removed. Use `pnpm exec ginko-cms init`.')
    }
    if (command === 'init') return await runInitCommand(parsed.cwd, io)
    if (command === 'push') {
      return await runPushCommand(parsed.args, parsed.cwd, io, options.convexClientFactory)
    }
    if (command === 'deploy') {
      return await runDeployCommand(
        parsed.args,
        parsed.cwd,
        io,
        options.runner,
        options.convexClientFactory,
      )
    }
    if (command === 'backup') {
      return await runBackupCommand(parsed.args, parsed.cwd, io, options.convexClientFactory)
    }
    if (command === 'migrate') {
      return await runMigrateCommand(parsed.args, parsed.cwd, io, options.convexClientFactory)
    }
    if (command === 'bridge') {
      throw new Error(
        '`ginko-cms bridge` was removed. Use `pnpm exec ginko-cms init` and `pnpm exec ginko-cms doctor`.',
      )
    }
    if (command === 'convex') {
      const runner = options.runner ?? runNodeScript
      return await runner(resolveConvexCliBin(), parsed.args.slice(1), { cwd: parsed.cwd })
    }
    if (command === 'doctor') return await runDoctorCommand(parsed.cwd, io)
    if (command === 'mcp-doctor') return await runMcpDoctor(parsed.cwd, io)

    throw new Error(`Unknown command "${command}".`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    write(io.stderr, `Error: ${message}\n\n${usage()}`)
    return 2
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href

if (isDirectExecution) {
  process.exitCode = await runGinkoCmsCli(process.argv.slice(2))
}
