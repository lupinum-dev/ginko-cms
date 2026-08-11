import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

import {
  loadGinkoContentContract,
  loadGinkoContentProviderName,
} from '../module/content-contract.js'
import { checkConvexComponentInstall, readExpectedContractBinding } from '../module/convex.js'
import { type CliIo, type ConvexClientFactory, hasFlag, write } from './args.js'
import { readLocalEnv } from './env.js'
import { createOperatorContext } from './operator.js'
import { loadContentConfig } from './push.js'

const legacyIdentitySecretNames = [
  ['CONVEX', 'IDENTITY', 'FORWARDING', 'KEY'].join('_'),
  ['GINKO', 'CMS', 'COMPONENT', 'FORWARDING', 'KEY'].join('_'),
]

type AccessContext = {
  userId: string | null
  role: 'viewer' | 'editor' | 'publisher' | 'owner' | null
  can: Record<string, boolean>
} | null

type InstalledContractStatus = {
  installedContentHash: string | null
  installedPresentationHash: string | null
  transitionState: 'ready' | 'locked' | null
  transitionRunId: string | null
}

type TerminalAssetCleanupPage = {
  page: Array<{ taskId: string; generation: number; attempts: number; lastError: string | null }>
  isDone: boolean
  continueCursor: string
}

type DoctorIssue = {
  name: string
  message: string
  fix: string
}

type DoctorOptions = {
  allowContractBindingUpdate?: boolean
}

const getAccessContext = makeFunctionReference<'query', Record<string, never>, AccessContext>(
  'ginkoCms/members:getAccessContext',
)
const getInstalledContractStatus = makeFunctionReference<
  'query',
  Record<string, never>,
  InstalledContractStatus
>('ginkoCms/contract:getInstalledContractStatus')
const listTerminalAssetCleanupTasks = makeFunctionReference<
  'query',
  { paginationOpts: { cursor: string | null; numItems: number } },
  TerminalAssetCleanupPage
>('ginkoCms/maintenance:listTerminalAssetCleanupTasks')

export async function runDoctorCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
  options: DoctorOptions = {},
): Promise<number> {
  const env = {
    ...readLocalEnv(cwd),
    ...process.env,
  }
  const deployment = hasFlag(args, '--deployment')
  const issues: DoctorIssue[] = [
    ...checkConvexComponentInstall(cwd),
    ...inspectEnvironment(env, deployment),
    ...(await inspectLocalContract(cwd, options)),
    ...legacyIdentitySecretNames
      .filter((name) => Boolean(env[name]?.trim()))
      .map((name) => ({
        name: `stale env ${name}`,
        message: `${name} is a stale legacy identity secret.`,
        fix: `Remove ${name}; Ginko CMS now uses CONVEX_DEPLOY_KEY for setup/admin transport.`,
      })),
  ]
  if (issues.length > 0) {
    write(io.stderr, `Ginko CMS doctor has ${issues.length} issue(s) in ${cwd}:\n`)
    for (const issue of issues) {
      write(io.stderr, `  ${issue.message}\n`)
      write(io.stderr, `    Fix: ${issue.fix}\n`)
    }
    return 1
  }

  if (deployment) {
    const deploymentIssues = await inspectDeployment(cwd, convexClientFactory)
    if (deploymentIssues.length > 0) {
      write(io.stderr, `Ginko CMS deployment doctor has ${deploymentIssues.length} issue(s):\n`)
      for (const issue of deploymentIssues) {
        write(io.stderr, `  ${issue.message}\n`)
        write(io.stderr, `    Fix: ${issue.fix}\n`)
      }
      return 1
    }
    write(
      io.stdout,
      'Ginko CMS deployment doctor passed: backend reachable, owner session authenticated, host contract hashes and transition state ready, and terminal asset cleanup inventory empty.\n',
    )
  }

  write(io.stdout, `Ginko CMS doctor passed in ${cwd}.\n`)
  return 0
}

function inspectEnvironment(env: Record<string, string | undefined>, deployment: boolean) {
  const issues: DoctorIssue[] = []
  if (!env.CONVEX_URL?.trim() && !env.NUXT_PUBLIC_CONVEX_URL?.trim()) {
    issues.push({
      name: 'missing Convex URL',
      message:
        'CONVEX_URL or NUXT_PUBLIC_CONVEX_URL is required for the CMS backend and content provider.',
      fix: 'Set CONVEX_URL or NUXT_PUBLIC_CONVEX_URL in .env.local or the host environment, then rerun `pnpm exec ginko-cms doctor`.',
    })
  }
  if (deployment && !env.SITE_URL?.trim() && !env.NUXT_PUBLIC_SITE_URL?.trim()) {
    issues.push({
      name: 'missing CMS site URL',
      message:
        'SITE_URL or NUXT_PUBLIC_SITE_URL is required to authenticate deployment checks through the host application.',
      fix: 'Set SITE_URL to the exact deployed Nuxt application origin, then rerun `pnpm exec ginko-cms doctor --deployment`.',
    })
  }
  if (deployment && !env.GINKO_CMS_SESSION_COOKIE?.trim()) {
    issues.push({
      name: 'missing owner session',
      message: 'GINKO_CMS_SESSION_COOKIE is required for the owner-authenticated deployment check.',
      fix: 'Sign in to Studio, set GINKO_CMS_SESSION_COOKIE in the invoking shell to the current Better Auth session cookie, and rerun `pnpm exec ginko-cms doctor --deployment`.',
    })
  }
  return issues
}

async function inspectLocalContract(cwd: string, options: DoctorOptions) {
  if (!existsSync(resolve(cwd, 'content.config.ts'))) {
    return [
      {
        name: 'missing content contract',
        message:
          'content.config.ts is missing, so the CMS contract and content provider cannot be verified.',
        fix: "Create content.config.ts with `provider: 'cms'` and the canonical collections, then run `pnpm exec ginko-cms deploy`.",
      },
    ] satisfies DoctorIssue[]
  }

  try {
    const [provider, config] = await Promise.all([
      loadGinkoContentProviderName(cwd),
      loadContentConfig(cwd),
    ])
    const expectedContent = await loadGinkoContentContract({
      rootDir: cwd,
      content: config.content,
    })
    const [contentHash, presentationHash] = await Promise.all([
      hashCanonicalJson(expectedContent as unknown as JsonValue),
      hashCanonicalJson(config.presentation),
    ])
    const issues: DoctorIssue[] = []
    if (provider !== 'cms') {
      issues.push({
        name: 'missing CMS content provider',
        message: 'content.config.ts does not select the Ginko CMS content provider.',
        fix: "Set `provider: 'cms'` in content.config.ts, then rerun `pnpm exec ginko-cms doctor`.",
      })
    }

    if (!options.allowContractBindingUpdate) {
      const binding = readExpectedContractBinding(cwd)
      if (binding?.contentHash === 'unbound' || binding?.presentationHash === 'unbound') {
        issues.push({
          name: 'unbound generated contract',
          message:
            'convex/ginkoCms/contractBinding.ts is still unbound to the canonical Content contract.',
          fix: 'Run `pnpm exec ginko-cms deploy` to generate and deploy the trusted contract hashes.',
        })
      } else if (
        binding &&
        (binding.contentHash !== contentHash || binding.presentationHash !== presentationHash)
      ) {
        issues.push({
          name: 'stale generated contract',
          message:
            'convex/ginkoCms/contractBinding.ts does not match content.config.ts and nuxt.config.ts.',
          fix: 'Run `pnpm exec ginko-cms deploy` for a compatible contract update, or start a contract transition for an incompatible live change.',
        })
      }
    }
    return issues
  } catch {
    return [
      {
        name: 'invalid content contract configuration',
        message:
          'content.config.ts or nuxt.config.ts could not be evaluated as the canonical CMS contract.',
        fix: 'Correct the configuration files, then rerun `pnpm exec ginko-cms doctor`.',
      },
    ] satisfies DoctorIssue[]
  }
}

async function inspectDeployment(
  cwd: string,
  convexClientFactory: ConvexClientFactory,
): Promise<DoctorIssue[]> {
  try {
    return await inspectReachableDeployment(cwd, convexClientFactory)
  } catch (cause) {
    return [classifyDeploymentFailure(cause)]
  }
}

function classifyDeploymentFailure(cause: unknown): DoctorIssue {
  const message = cause instanceof Error ? cause.message.toLowerCase() : ''
  if (/authentication|unauthorized|forbidden|session|http 401|http 403/u.test(message)) {
    return {
      name: 'deployment authentication failed',
      message:
        'The deployment is reachable, but the configured owner session could not authenticate.',
      fix: 'Sign in again, replace GINKO_CMS_SESSION_COOKIE in the invoking shell, and rerun `pnpm exec ginko-cms doctor --deployment`.',
    }
  }
  if (/function.*not found|could not find.*function|no public function/u.test(message)) {
    return {
      name: 'stale deployed backend',
      message:
        'The deployment is reachable but does not expose the current CMS diagnosis functions.',
      fix: 'Run `pnpm exec ginko-cms deploy`, then rerun `pnpm exec ginko-cms doctor --deployment`.',
    }
  }
  return {
    name: 'backend unreachable',
    message: 'The configured Convex or Ginko CMS host could not be reached.',
    fix: 'Check CONVEX_URL and SITE_URL, run `pnpm exec ginko-cms deploy`, then retry `pnpm exec ginko-cms doctor --deployment`.',
  }
}

async function inspectReachableDeployment(
  cwd: string,
  convexClientFactory: ConvexClientFactory,
): Promise<DoctorIssue[]> {
  const { client } = await createOperatorContext(cwd, convexClientFactory)
  const config = await loadContentConfig(cwd)
  const expectedContent = await loadGinkoContentContract({
    rootDir: cwd,
    content: config.content,
  })
  const [expectedContentHash, expectedPresentationHash] = await Promise.all([
    hashCanonicalJson(expectedContent as unknown as JsonValue),
    hashCanonicalJson(config.presentation),
  ])
  const [access, contract, terminalCleanup] = await Promise.all([
    client.query(getAccessContext, {}),
    client.query(getInstalledContractStatus, {}),
    client.query(listTerminalAssetCleanupTasks, {
      paginationOpts: { cursor: null, numItems: 100 },
    }),
  ])
  const issues: DoctorIssue[] = []
  if (!access?.userId) {
    issues.push({
      name: 'inactive CMS member',
      message: 'The operator session is not an active CMS member.',
      fix: 'Ask a CMS owner to invite this account, accept the invitation, and sign in again.',
    })
  } else {
    if (access.role !== 'owner') {
      issues.push({
        name: 'operator is not owner',
        message: `The operator role is ${access.role ?? 'none'}, not owner.`,
        fix: 'Run the deployment doctor with an active CMS owner session.',
      })
    }
    if (!access.can[cmsPermissionKeys.managePortability]) {
      issues.push({
        name: 'operator portability capability missing',
        message: 'The operator cannot manage portability or projection/reference repair.',
        fix: 'Run the deployment doctor with an owner whose current role grants portability management.',
      })
    }
    if (!access.can[cmsPermissionKeys.manageAssetRecovery]) {
      issues.push({
        name: 'operator recovery capability missing',
        message: 'The operator cannot manage asset recovery.',
        fix: 'Run the deployment doctor with an owner whose current role grants asset recovery management.',
      })
    }
  }
  if (!contract.installedContentHash || !contract.installedPresentationHash) {
    issues.push({
      name: 'contract not installed',
      message: 'No complete CMS contract is installed on the deployment.',
      fix: 'Run `pnpm exec ginko-cms deploy` to deploy the host binding and install the contract.',
    })
  } else {
    if (contract.installedContentHash !== expectedContentHash) {
      issues.push({
        name: 'installed content contract drift',
        message: 'The installed content contract hash does not match content.config.ts.',
        fix: 'Run `pnpm exec ginko-cms deploy` for a compatible update, or use the contract transition commands for an incompatible live change.',
      })
    }
    if (contract.installedPresentationHash !== expectedPresentationHash) {
      issues.push({
        name: 'installed presentation drift',
        message: 'The installed presentation hash does not match nuxt.config.ts.',
        fix: 'Run `pnpm exec ginko-cms deploy` to install the current presentation contract.',
      })
    }
  }
  if (contract.transitionState !== 'ready') {
    const runId = contract.transitionRunId ?? '<run-id>'
    issues.push({
      name: 'contract transition not ready',
      message:
        contract.transitionState === 'locked'
          ? `Contract transition ${contract.transitionRunId ?? 'unknown'} is locking Studio writes.`
          : 'The installed contract transition state is unavailable.',
      fix:
        contract.transitionState === 'locked'
          ? `Run \`pnpm exec ginko-cms contract transition status ${runId}\`, resolve its blockers, and resume it.`
          : 'Run `pnpm exec ginko-cms deploy`, then inspect contract transition status again.',
    })
  }
  if (terminalCleanup.page.length > 0) {
    const count = `${terminalCleanup.page.length}${terminalCleanup.isDone ? '' : '+'}`
    issues.push({
      name: 'terminal asset cleanup failures',
      message: `${count} terminal asset cleanup failure(s) require attention.`,
      fix: 'Run `pnpm exec ginko-cms asset cleanup list` and retry each task with its current generation.',
    })
  }
  return issues
}
