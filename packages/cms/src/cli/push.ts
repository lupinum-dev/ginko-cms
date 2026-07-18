import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { createJiti } from 'jiti'

import {
  loadGinkoContentContract,
  type ContentRuntimePolicyInput,
} from '../module/content-contract.js'
import { readExpectedContractBinding } from '../module/convex.js'
import { type CliIo, type ConvexClientFactory, write } from './args.js'
import { deployKey, publicConvexUrl } from './env.js'

type PushArgs = {
  check: boolean
}

type CheckCmsContractResult = {
  matches: boolean
  installedContentHash: string | null
  installedPresentationHash: string | null
  expectedContentHash: string
  expectedPresentationHash: string
  drift: Array<{ path: string; installed?: unknown; expected?: unknown }>
  presentationDrift: Array<{ path: string; installed?: unknown; expected?: unknown }>
}

type DeployedContractBinding = {
  contentHash: string
  presentationHash: string
}

function parsePushArgs(args: string[]): PushArgs {
  return {
    check: args.includes('--check'),
  }
}

export async function loadContentConfig(
  cwd: string,
): Promise<{ content?: ContentRuntimePolicyInput; presentation: JsonValue }> {
  const configPath = resolve(cwd, 'nuxt.config.ts')
  if (!existsSync(resolve(cwd, 'content.config.ts'))) {
    throw new Error(
      'ginko-cms push requires content.config.ts as the canonical Content contract source.',
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
    ginkoCms?: { editorialLayout?: JsonValue } | false
    content?: { i18n?: ContentRuntimePolicyInput }
  }
  if (config.ginkoCms === false) {
    throw new Error('ginko-cms is disabled in nuxt.config; no collection contracts can be pushed.')
  }
  return {
    content: config.content?.i18n,
    presentation:
      config.ginkoCms && typeof config.ginkoCms === 'object'
        ? (config.ginkoCms.editorialLayout ?? { collections: {} })
        : { collections: {} },
  }
}

export async function runPushCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const push = parsePushArgs(args.slice(1))
  const config = await loadContentConfig(cwd)
  const content = await loadGinkoContentContract({ rootDir: cwd, content: config.content })
  const contentHash = await hashCanonicalJson(content as unknown as JsonValue)
  const presentationHash = await hashCanonicalJson(config.presentation)
  const client = convexClientFactory(publicConvexUrl(cwd))
  const adminKey = deployKey(cwd)
  if (!client.setAdminAuth) {
    throw new Error('ginko-cms push requires a Convex client with admin auth support.')
  }
  client.setAdminAuth(adminKey)

  if (push.check) {
    const result = (await client.query(anyApi.ginkoCms.contract.checkCmsContract, {
      content,
      contentHash,
      presentation: config.presentation,
      presentationHash,
    })) as CheckCmsContractResult
    if (!result.matches) {
      const drift = [...result.drift, ...result.presentationDrift]
      write(io.stderr, `Ginko CMS contract drift detected (${drift.length} change(s)):\n`)
      for (const change of drift) write(io.stderr, `  - ${change.path}\n`)
      return 1
    }
    write(
      io.stdout,
      `Ginko CMS contract is installed for ${Object.keys(content.collections).length} collection(s) (content=${contentHash}, presentation=${presentationHash}).\n`,
    )
    return 0
  }

  const binding = readExpectedContractBinding(cwd)
  if (binding?.contentHash !== contentHash || binding.presentationHash !== presentationHash) {
    throw new Error(
      'The generated Convex host contract binding does not match this contract. Run `pnpm exec ginko-cms deploy` so the trusted hashes are deployed before installation.',
    )
  }
  let deployedBinding: DeployedContractBinding
  try {
    deployedBinding = (await client.query(
      anyApi.ginkoCms.contractBinding.getExpectedCmsContractBinding,
      {},
    )) as DeployedContractBinding
  } catch (cause) {
    throw new Error(
      'The deployed Convex host does not expose its expected CMS contract binding. Run `pnpm exec ginko-cms deploy` before installation.',
      { cause },
    )
  }
  if (
    deployedBinding.contentHash !== contentHash ||
    deployedBinding.presentationHash !== presentationHash
  ) {
    throw new Error(
      'The deployed Convex host contract binding does not match this contract. Run `pnpm exec ginko-cms deploy` before installation.',
    )
  }

  const result = (await client.mutation(anyApi.ginkoCms.contract.installCmsContract, {
    content,
    contentHash,
    presentation: config.presentation,
    presentationHash,
  })) as { created: number; updated: number; skipped: number; missingFromConfig: string[] }
  write(
    io.stdout,
    `Ginko CMS contract installed: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, missingFromConfig=[${result.missingFromConfig.join(', ')}].\n`,
  )
  write(io.stdout, `Content SHA-256: ${contentHash}\n`)
  write(io.stdout, `Presentation SHA-256: ${presentationHash}\n`)
  return 0
}
