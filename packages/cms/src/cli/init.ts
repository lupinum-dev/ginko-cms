import { checkConvexComponentInstall, writeConvexSetupFiles } from '../module/convex.js'
import { type CliIo, hasFlag, write } from './args.js'

export async function runInitCommand(args: string[], cwd: string, io: CliIo): Promise<number> {
  const mcp = hasFlag(args, '--mcp')
  const unknown = args.slice(1).filter((arg) => arg !== '--mcp')
  if (unknown.length > 0) throw new Error(`Unknown init option "${unknown[0]}".`)
  const result = writeConvexSetupFiles(cwd, { mcp })
  const issues = checkConvexComponentInstall(cwd, { mcp })
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
        `Host apps must depend directly on \`better-convex-nuxt\`, \`better-auth\`, \`kysely\`, and \`@lupinum/ginko-cms-convex\`.`,
        mcp
          ? `The generated Convex deployment exposes the provider-neutral MCP endpoint at \`/mcp\`.`
          : `MCP is disabled. Re-run \`pnpm exec ginko-cms init --mcp\` to generate the endpoint.`,
        `Set \`CONVEX_URL\` or \`NUXT_PUBLIC_CONVEX_URL\` in the Nuxt app environment.`,
        `Set \`CONVEX_DEPLOY_KEY\` in the Nuxt app/server environment before contract sync.`,
        `Set versioned \`BETTER_AUTH_SECRETS\` in Convex; do not expose it to the Nuxt process.`,
        `After the first deploy, bootstrap the read-only JWKS lifecycle with \`pnpm exec better-convex-nuxt-convex run auth:rotateSigningKey '{}'\` before admitting auth traffic.`,
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
