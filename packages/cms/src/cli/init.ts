import { checkConvexComponentInstall, writeConvexSetupFiles } from '../module/convex.js'
import { type CliIo, write } from './args.js'

export async function runInitCommand(cwd: string, io: CliIo): Promise<number> {
  const result = writeConvexSetupFiles(cwd)
  const issues = checkConvexComponentInstall(cwd)
  const checkResult = issues.length === 0 ? 0 : 1
  write(
    io.stdout,
    `Ginko CMS initialized in ${cwd}: ${result.written.length} setup file(s) written, ${result.updated.length} untouched generated file(s) updated, ${result.skipped.length} existing file(s) left untouched.\n`,
  )
  for (const conflict of result.conflicts) {
    write(
      io.stderr,
      `Refused to overwrite modified generated file ${conflict.path}. Merge the package template manually:\n${conflict.diff}\n`,
    )
  }
  if (checkResult === 0) {
    write(
      io.stdout,
      [
        `Next: run \`pnpm exec ginko-cms doctor\`, configure the required environment, then run \`pnpm exec ginko-cms deploy\`.`,
        `Host apps must depend directly on \`@convex-dev/better-auth\`, \`better-auth\`, and \`@lupinum/ginko-cms-convex\`.`,
        `If MCP code mode is enabled, host apps must also depend directly on \`secure-exec\`.`,
        `Set \`CONVEX_URL\` or \`NUXT_PUBLIC_CONVEX_URL\` in the Nuxt app environment.`,
        `Set \`CONVEX_DEPLOY_KEY\` in the Nuxt app/server environment before contract sync.`,
        `Set \`BETTER_AUTH_SECRET\` in the host and Convex deployment; runtime and doctor fail closed without it.`,
        `Set \`GINKO_FIRST_OWNER_EMAIL\` in the Convex deployment with \`pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL you@example.com\`.`,
        '',
      ].join('\n'),
    )
  } else {
    write(io.stderr, `Ginko CMS doctor has ${issues.length} issue(s) in ${cwd}:\n`)
    for (const issue of issues) {
      write(io.stderr, `  ${issue.message}\n`)
      write(io.stderr, `    Fix: ${issue.fix}\n`)
    }
    write(
      io.stdout,
      `Run \`pnpm exec ginko-cms doctor\` for details after fixing the reported issue(s).\n`,
    )
  }
  return checkResult
}
