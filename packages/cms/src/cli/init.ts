import { type CliIo, write } from './args.js'
import { runBridgeCheck, writeBridgeFiles } from './bridge.js'

export async function runInitCommand(cwd: string, io: CliIo): Promise<number> {
  const result = await writeBridgeFiles(cwd)
  const checkResult = await runBridgeCheck(cwd, { stderr: io.stderr }, 'doctor')
  write(
    io.stdout,
    `Ginko CMS initialized in ${cwd}: ${result.written.length} bridge file(s), ${result.managed.length} managed edit(s).\n`,
  )
  if (checkResult === 0) {
    write(
      io.stdout,
      [
        `Next: run \`pnpm exec ginko-cms doctor\`, configure the required environment, then run \`pnpm exec ginko-cms deploy\`.`,
        `Host apps must depend directly on \`@convex-dev/better-auth\`, \`better-auth\`, and \`@lupinum/ginko-cms-convex\`.`,
        `If MCP code mode is enabled, host apps must also depend directly on \`secure-exec\`.`,
        `Set \`CONVEX_URL\` or \`NUXT_PUBLIC_CONVEX_URL\` in the Nuxt app environment.`,
        `Set \`CONVEX_DEPLOY_KEY\` in the Nuxt app/server environment before contract sync.`,
        `Set the same \`CONVEX_IDENTITY_FORWARDING_KEY\` or \`GINKO_CMS_COMPONENT_FORWARDING_KEY\` in the Nuxt app/server environment and Convex deployment.`,
        `Set \`GINKO_FIRST_OWNER_EMAIL\` in the Convex deployment with \`pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL you@example.com\`.`,
        '',
      ].join('\n'),
    )
  } else {
    write(
      io.stdout,
      `Run \`pnpm exec ginko-cms doctor\` for details after fixing the reported issue(s).\n`,
    )
  }
  return checkResult
}
