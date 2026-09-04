import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import { ConvexHttpClient } from 'convex/browser'

import { loadGinkoContentContract } from '../module/content-contract.js'
import { writeExpectedContractBinding } from '../module/convex.js'
import { type CliIo, type CliRunner, type ConvexClientFactory, write } from './args.js'
import { resolveConvexCliBin, runNodeScript } from './convex.js'
import { runDoctorCommand } from './doctor.js'
import { loadContentConfig, runPushCommand } from './push.js'

function parsePushArgs(args: string[]): { check: boolean; transition: boolean } {
  return {
    check: args.includes('--check'),
    transition: args.includes('--transition'),
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
  if (push.check && push.transition) {
    throw new Error('ginko-cms deploy accepts either --check or --transition, not both.')
  }
  const doctor = await runDoctorCommand(['doctor'], cwd, io, convexClientFactory, {
    allowContractBindingUpdate: true,
  })
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
  const config = await loadContentConfig(cwd)
  const content = await loadGinkoContentContract({ rootDir: cwd })
  writeExpectedContractBinding(cwd, {
    contentHash: await hashCanonicalJson(content as unknown as JsonValue),
    presentationHash: await hashCanonicalJson(config.presentation),
  })
  const deployResult = await runner(resolveConvexCliBin(), deployArgs, { cwd })
  if (deployResult !== 0) return deployResult
  if (push.transition) {
    write(
      io.stdout,
      'Deployed the target CMS contract binding; installation is deferred to contract transition activation.\n',
    )
    return 0
  }
  return await runPushCommand(['push', ...pushArgs.slice(1)], cwd, io, convexClientFactory)
}
