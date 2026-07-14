import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import { verifyPortableDirectoryBounded } from '@lupinum/ginko-content/portability/node'
import { exchangeConvexToken } from 'better-convex-nuxt/server'
import { ConvexHttpClient } from 'convex/browser'

import { loadGinkoContentContract } from '../module/content-contract.js'
import {
  applyPreparedPortableDraftImport,
  exportPortablePublishedContent,
  preparePortableDraftImport,
  type PreparedPortableDraftImport,
} from '../portability/commands.js'
import { type CliIo, type ConvexClientFactory, readFlag, write } from './args.js'
import {
  cmsSiteOrigin,
  convexDeploymentId,
  convexSiteOrigin,
  operatorSessionCookie,
  publicConvexUrl,
} from './env.js'
import { loadContentConfig } from './push.js'

type OperatorClient = Pick<ConvexHttpClient, 'query' | 'mutation' | 'action'>

export async function runContentCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const command = args[1]
  if (command === 'verify') return await verifyCommand(args, cwd, io)
  if (command === 'export') {
    const output = readFlag(args, '--out')
    if (!output) throw new Error('ginko-cms content export requires --out <directory>.')
    const { client, transfer } = await operatorContext(cwd, convexClientFactory)
    const contract = await localContract(cwd)
    const requested = readFlag(args, '--collections')
    const collections = requested
      ? requested
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : Object.keys(contract.collections)
    const unknown = collections.filter((slug) => !contract.collections[slug])
    if (unknown.length > 0) {
      throw new Error(`Portable export scope contains unknown collections: ${unknown.join(', ')}.`)
    }
    const result = await exportPortablePublishedContent(client, resolve(cwd, output), {
      deploymentId: convexDeploymentId(cwd),
      collections,
      contract,
      assetTransfer: transfer,
    })
    write(
      io.stdout,
      `Published content export complete: scope=${collections.join(',')}, published=${result.documentCount}, assets=${result.assetCount}, manifest=${result.manifestSha256}.\n`,
    )
    return 0
  }
  if (command === 'import') {
    const applyFile = readFlag(args, '--apply')
    if (applyFile) {
      if (readFlag(args, '--plan') || (args[2] && !args[2].startsWith('--'))) {
        throw new Error('ginko-cms content import --apply accepts only one plan file.')
      }
      const { client, transfer } = await operatorContext(cwd, convexClientFactory)
      const prepared = await readPreparedPlan(resolve(cwd, applyFile))
      const receipt = (await applyPreparedPortableDraftImport(client, prepared, transfer)) as {
        state?: string
      }
      write(io.stdout, `Import complete: state=${receipt.state ?? 'complete'}.\n`)
      return 0
    }
    const directory = args[2]
    const planFile = readFlag(args, '--plan')
    if (!directory || directory.startsWith('--') || !planFile) {
      throw new Error('ginko-cms content import requires <directory> --plan <file>.')
    }
    const { client } = await operatorContext(cwd, convexClientFactory)
    const contract = await localContract(cwd)
    const prepared = await preparePortableDraftImport(client, resolve(cwd, directory), {
      deploymentId: convexDeploymentId(cwd),
      targetContractSha256: await hashCanonicalJson(contract),
    })
    const planPath = resolve(cwd, planFile)
    writeFileSync(planPath, `${JSON.stringify(prepared, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    const effects = countEffects(prepared)
    write(
      io.stdout,
      `Import plan written: ${planPath}\nscope=${prepared.payload.scope.collections.join(',')}, create=${effects.create}, update=${effects.update}, skip=${effects.skip}, assets-upload=${effects.upload}, assets-reuse=${effects.reuse}, blockers=0.\nReview the plan, then run ginko-cms content import --apply ${planPath}.\n`,
    )
    return 0
  }
  throw new Error('ginko-cms content requires export, verify, or import.')
}

async function verifyCommand(args: string[], cwd: string, io: CliIo) {
  const directory = args[2]
  if (!directory || directory.startsWith('--')) {
    throw new Error('ginko-cms content verify requires <directory>.')
  }
  const verified = await verifyPortableDirectoryBounded(resolve(cwd, directory))
  const manifestSha256 = await hashCanonicalJson(verified.manifest)
  write(
    io.stdout,
    `Portable content verified: documents=${verified.manifest.documents.length}, assets=${verified.manifest.assets.length}, manifest=${manifestSha256}.\n`,
  )
  return 0
}

async function localContract(cwd: string) {
  const config = await loadContentConfig(cwd)
  return await loadGinkoContentContract({ rootDir: cwd, content: config.content })
}

async function operatorContext(cwd: string, convexClientFactory: ConvexClientFactory) {
  const sessionCookie = operatorSessionCookie(cwd)
  const siteOrigin = convexSiteOrigin(cwd)
  const raw = convexClientFactory(publicConvexUrl(cwd))
  if (!raw.setAuth) {
    throw new Error('ginko-cms content commands require a Convex client with user auth support.')
  }
  const authorize = async () => {
    const exchanged = await exchangeConvexToken({
      siteUrl: siteOrigin,
      credential: { type: 'cookie', value: sessionCookie },
    })
    if (!exchanged.token) {
      throw new Error(
        `Ginko CMS operator authentication failed${exchanged.status ? ` with HTTP ${exchanged.status}` : ''}.`,
      )
    }
    raw.setAuth!(exchanged.token)
  }
  const client: OperatorClient = {
    query: async (reference, value) => {
      await authorize()
      return await raw.query(reference, value)
    },
    mutation: async (reference, value) => {
      await authorize()
      return await raw.mutation(reference, value)
    },
    action: async (reference, value) => {
      await authorize()
      return await raw.action(reference, value)
    },
  }
  return {
    client,
    transfer: {
      cmsOrigin: cmsSiteOrigin(cwd),
      sessionCookie,
    },
  }
}

async function readPreparedPlan(path: string): Promise<PreparedPortableDraftImport> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as PreparedPortableDraftImport
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.planId !== 'string' ||
    typeof parsed.runId !== 'string' ||
    typeof parsed.directory !== 'string' ||
    typeof parsed.payloadSha256 !== 'string' ||
    !parsed.payload ||
    !Array.isArray(parsed.items) ||
    !Array.isArray(parsed.assets) ||
    !Array.isArray(parsed.blockers) ||
    parsed.blockers.length > 0
  ) {
    throw new Error('Portable import plan file is invalid or blocked.')
  }
  if ((await hashCanonicalJson(parsed.payload)) !== parsed.payloadSha256) {
    throw new Error('Portable import plan payload hash does not match the file.')
  }
  if (
    parsed.payload.itemCount !== parsed.items.length ||
    parsed.payload.assetCount !== parsed.assets.length ||
    (await hashCanonicalJson(parsed.items.map((item) => item.payload))) !==
      parsed.payload.itemRootSha256 ||
    (await hashCanonicalJson(parsed.assets.map((asset) => asset.payload))) !==
      parsed.payload.assetRootSha256
  ) {
    throw new Error('Portable import plan rows do not match the payload.')
  }
  const applyOrders = new Set<number>()
  for (const item of parsed.items) {
    if (
      !Number.isSafeInteger(item.applyOrder) ||
      item.applyOrder < 0 ||
      item.applyOrder >= parsed.items.length ||
      applyOrders.has(item.applyOrder) ||
      (await hashCanonicalJson(item.payload)) !== item.inputSha256 ||
      !item.document ||
      (await hashCanonicalJson(item.document)) !== item.payload.documentSha256
    ) {
      throw new Error(`Portable import plan item ${item.itemKey} is invalid.`)
    }
    applyOrders.add(item.applyOrder)
  }
  for (const asset of parsed.assets) {
    if ((await hashCanonicalJson(asset.payload)) !== asset.inputSha256) {
      throw new Error(`Portable import plan asset ${asset.assetKey} is invalid.`)
    }
  }
  return parsed
}

function countEffects(prepared: PreparedPortableDraftImport) {
  const count = (effect: 'create' | 'update' | 'skip') =>
    prepared.items.filter((item) => item.payload.effect === effect).length
  const assets = (effect: 'upload' | 'reuse') =>
    prepared.assets.filter((asset) => asset.payload.effect === effect).length
  return {
    create: count('create'),
    update: count('update'),
    skip: count('skip'),
    upload: assets('upload'),
    reuse: assets('reuse'),
  }
}
