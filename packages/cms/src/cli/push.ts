import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { createJiti } from 'jiti'

import {
  loadGinkoContentContract,
  type ContentRuntimePolicyInput,
} from '../module/content-contract.js'
import { type CliIo, type ConvexClientFactory, write } from './args.js'
import { deployKey, publicConvexUrl } from './env.js'

type PushArgs = {
  check: boolean
}

type CheckCmsPolicyResult = {
  matches: boolean
  installedContractSha256: string | null
  expectedContractSha256: string
  drift: Array<{ path: string; installed?: unknown; expected?: unknown }>
}

function parsePushArgs(args: string[]): PushArgs {
  return {
    check: args.includes('--check'),
  }
}

async function loadPushConfig(cwd: string): Promise<{ content?: ContentRuntimePolicyInput }> {
  const configPath = resolve(cwd, 'nuxt.config.ts')
  if (!existsSync(resolve(cwd, 'content.config.ts'))) {
    throw new Error(
      'ginko-cms push requires content.config.ts as the canonical Content policy source.',
    )
  }
  const importer = createJiti(import.meta.url, { interopDefault: true })
  const globalWithNuxtConfig = globalThis as typeof globalThis & {
    defineNuxtConfig?: (config: unknown) => unknown
  }
  const previousDefineNuxtConfig = globalWithNuxtConfig.defineNuxtConfig
  globalWithNuxtConfig.defineNuxtConfig ??= (config: unknown) => config
  let loaded: unknown
  try {
    loaded = existsSync(configPath) ? await importer.import(configPath) : {}
  } finally {
    if (previousDefineNuxtConfig === undefined) {
      delete globalWithNuxtConfig.defineNuxtConfig
    } else {
      globalWithNuxtConfig.defineNuxtConfig = previousDefineNuxtConfig
    }
  }
  const config = ((loaded as { default?: unknown }).default ?? loaded) as {
    ginkoCms?: object | false
    content?: { i18n?: ContentRuntimePolicyInput }
  }
  if (config.ginkoCms === false) {
    throw new Error('ginko-cms is disabled in nuxt.config; no collection contracts can be pushed.')
  }
  return { content: config.content?.i18n }
}

export async function runPushCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const push = parsePushArgs(args.slice(1))
  const config = await loadPushConfig(cwd)
  const contract = await loadGinkoContentContract({ rootDir: cwd, content: config.content })
  const contractSha256 = await hashCanonicalJson(contract)
  const client = convexClientFactory(publicConvexUrl(cwd))
  const adminKey = deployKey(cwd)
  if (!client.setAdminAuth) {
    throw new Error('ginko-cms push requires a Convex client with admin auth support.')
  }
  client.setAdminAuth(adminKey)

  if (push.check) {
    const result = (await client.query(anyApi.ginkoCms.policy.checkCmsPolicy, {
      contract,
      contractSha256,
    })) as CheckCmsPolicyResult
    if (!result.matches) {
      write(io.stderr, `Ginko CMS policy drift detected (${result.drift.length} change(s)):\n`)
      for (const change of result.drift) write(io.stderr, `  - ${change.path}\n`)
      return 1
    }
    write(
      io.stdout,
      `Ginko CMS policy ${contractSha256} is installed for ${Object.keys(contract.collections).length} collection(s).\n`,
    )
    return 0
  }

  const result = (await client.mutation(anyApi.ginkoCms.policy.installCmsPolicy, {
    contract,
    contractSha256,
  })) as { created: number; updated: number; skipped: number; missingFromConfig: string[] }
  write(
    io.stdout,
    `Ginko CMS collection contracts pushed: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, missingFromConfig=[${result.missingFromConfig.join(', ')}].\n`,
  )
  write(io.stdout, `Contract SHA-256: ${contractSha256}\n`)
  return 0
}
