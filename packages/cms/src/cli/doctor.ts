import { checkConvexComponentInstall } from '../module/convex.js'
import type { CliIo } from './args.js'
import { write } from './args.js'
import { readLocalEnv } from './env.js'

const legacyIdentitySecretNames = [
  ['CONVEX', 'IDENTITY', 'FORWARDING', 'KEY'].join('_'),
  ['GINKO', 'CMS', 'COMPONENT', 'FORWARDING', 'KEY'].join('_'),
]

export async function runDoctorCommand(cwd: string, io: CliIo): Promise<number> {
  const env = {
    ...readLocalEnv(cwd),
    ...process.env,
  }
  const issues = [
    ...checkConvexComponentInstall(cwd),
    ...legacyIdentitySecretNames
      .filter((name) => Boolean(env[name]?.trim()))
      .map((name) => ({
        name: `stale env ${name}`,
        message: `${name} is a stale legacy identity secret.`,
        fix: `Remove ${name}; Ginko CMS now uses CONVEX_DEPLOY_KEY for setup/admin transport.`,
      })),
  ]
  if (issues.length === 0) {
    write(io.stdout, `Ginko CMS doctor passed in ${cwd}.\n`)
    return 0
  }

  write(io.stderr, `Ginko CMS doctor has ${issues.length} issue(s) in ${cwd}:\n`)
  for (const issue of issues) {
    write(io.stderr, `  ${issue.message}\n`)
    write(io.stderr, `    Fix: ${issue.fix}\n`)
  }
  return 1
}
