import { ConvexHttpClient } from 'convex/browser'

import { type CliIo, type CliRunner, type ConvexClientFactory, write } from './args.js'
import { resolveConvexCliBin, runNodeScript } from './convex.js'
import { runDoctorCommand } from './doctor.js'
import { runPushCommand } from './push.js'

function parsePushArgs(args: string[]): { check: boolean } {
  return {
    check: args.includes('--check'),
  }
}

export async function runDeployCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  runner: CliRunner = runNodeScript,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const separator = args.indexOf('--')
  const deployArgs =
    separator >= 0
      ? args.slice(separator + 1)
      : ['dev', '--once', '--tail-logs', 'disable', '--typecheck', 'disable']
  const pushArgs = separator >= 0 ? args.slice(0, separator) : args
  const push = parsePushArgs(pushArgs.slice(1))
  const doctor = await runDoctorCommand(cwd, io)
  if (doctor !== 0) return doctor
  if (push.check) {
    const pushResult = await runPushCommand(
      ['push', ...pushArgs.slice(1)],
      cwd,
      io,
      convexClientFactory,
    )
    if (pushResult !== 0) return pushResult
    write(
      io.stdout,
      'Ginko CMS deploy check passed; Convex deploy skipped because --check was set.\n',
    )
    return 0
  }
  const deployResult = await runner(resolveConvexCliBin(), deployArgs, { cwd })
  if (deployResult !== 0) return deployResult
  return await runPushCommand(['push', ...pushArgs.slice(1)], cwd, io, convexClientFactory)
}
