import { createHash, randomBytes, randomUUID } from 'node:crypto'

import type { ResolvedContentContractV1 } from '@lupinum/ginko-content/cms-contract'
import { hashCanonicalJson, type PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import {
  writePortableDirectory,
  verifyPortableDirectoryBounded,
} from '@lupinum/ginko-content/portability/node'
import type { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import {
  uploadPreparedPortableDraftImportAssets,
  downloadPortableExportAsset,
  type PortableExportAsset,
  type PortableAssetTransferOptions,
} from './asset-transport.js'
import { readCmsPortableDirectory } from './directory.js'
import { createPortableDraftImportPlan, type PortableDraftImportPlan } from './plan.js'

const api = anyApi
const IMPORT_PAGE_SIZE = 250
const EXPORT_PAGE_SIZE = 100

type DirectCmsClient = Pick<ConvexHttpClient, 'query' | 'mutation' | 'action'>

export type PreparedPortableDraftImport = PortableDraftImportPlan & {
  planId: string
  runId: string
  directory: string
}

export type PortablePublishedExportOptions = {
  deploymentId: string
  collections: string[]
  contract: ResolvedContentContractV1
  assetTransfer: PortableAssetTransferOptions
  runId?: string
}

export async function exportPortablePublishedContent(
  client: DirectCmsClient,
  directory: string,
  options: PortablePublishedExportOptions,
) {
  const collections = [...options.collections].sort(compare)
  if (collections.length === 0 || new Set(collections).size !== collections.length) {
    throw new Error('Portable export requires a non-empty collection scope without duplicates.')
  }
  const sourceContractSha256 = await hashCanonicalJson(options.contract as never)
  const runId = options.runId ?? randomUUID()
  const leaseTokenHash = createHash('sha256').update(randomBytes(32)).digest('hex')
  const created = (await client.mutation(api.ginkoCms.portability.createExportRun, {
    runId,
    deploymentId: options.deploymentId,
    scope: { collections },
    sourceContractSha256,
    leaseTokenHash,
  })) as { leaseGeneration: number }
  try {
    let complete = false
    while (!complete) {
      const page = (await client.mutation(api.ginkoCms.portability.captureExportPage, {
        runId,
        leaseTokenHash,
        leaseGeneration: created.leaseGeneration,
      })) as { complete: boolean }
      complete = page.complete
    }
    const ready = (await client.mutation(api.ginkoCms.portability.sealExportRun, {
      runId,
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })) as { documentCount: number; assetCount: number }
    await writePortableDirectory(directory, {
      contract: options.contract,
      documents: exportDocuments(client, runId),
      assets: exportAssets(client, runId, options.assetTransfer),
    })
    const verified = await verifyPortableDirectoryBounded(directory)
    const manifestSha256 = await hashCanonicalJson(verified.manifest as never)
    const receipt = await client.mutation(api.ginkoCms.portability.completeExportRun, {
      runId,
      manifestSha256,
      documentCount: ready.documentCount,
      assetCount: ready.assetCount,
    })
    return { runId, manifestSha256, ...ready, receipt }
  } catch (error) {
    await client.mutation(api.ginkoCms.portability.abortExportRun, { runId }).catch(() => {})
    throw error
  }
}

async function* exportDocuments(
  client: DirectCmsClient,
  runId: string,
): AsyncIterable<PortableDocumentV1> {
  let cursor: string | null = null
  do {
    const page = (await client.query(api.ginkoCms.portability.readExportDocuments, {
      runId,
      cursor,
      limit: EXPORT_PAGE_SIZE,
    })) as {
      documents: Array<{ document: PortableDocumentV1; documentSha256: string }>
      cursor: string | null
    }
    for (const row of page.documents) {
      if ((await hashCanonicalJson(row.document as never)) !== row.documentSha256) {
        throw new Error('Portable export document changed after roster capture.')
      }
      yield row.document
    }
    cursor = page.cursor
  } while (cursor !== null)
}

async function* exportAssets(
  client: DirectCmsClient,
  runId: string,
  transfer: PortableAssetTransferOptions,
) {
  let cursor: string | null = null
  do {
    const page = (await client.query(api.ginkoCms.portability.readExportAssets, {
      runId,
      cursor,
      limit: EXPORT_PAGE_SIZE,
    })) as { assets: PortableExportAsset[]; cursor: string | null }
    for (const asset of page.assets) {
      yield {
        sha256: asset.sha256,
        file: `public/ginko-assets/${asset.sha256}.${extensionFor(asset.mediaType)}`,
        bytes: asset.bytes,
        mediaType: asset.mediaType,
        content: downloadPortableExportAsset(runId, asset, transfer),
      }
    }
    cursor = page.cursor
  } while (cursor !== null)
}

function extensionFor(mediaType: PortableExportAsset['mediaType']) {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length)
}

export async function preparePortableDraftImport(
  client: DirectCmsClient,
  directory: string,
  options: {
    deploymentId: string
    targetContractSha256: string
    planId?: string
  },
): Promise<PreparedPortableDraftImport> {
  const bundle = await readCmsPortableDirectory(directory)
  const identities = await Promise.all(
    bundle.documents.map(async ({ document }) => {
      const identity = {
        collection: document.collection,
        canonicalKey: document.canonicalKey,
        locale: document.locale,
      }
      return { itemKey: await hashCanonicalJson(identity), identity }
    }),
  )
  identities.sort((left, right) => compare(left.itemKey, right.itemKey))
  const currentDraftSha256ByItemKey = new Map<string, string | null>()
  for (let offset = 0; offset < identities.length; offset += IMPORT_PAGE_SIZE) {
    const rows = (await client.query(api.ginkoCms.portability.inspectPortableDrafts, {
      items: identities.slice(offset, offset + IMPORT_PAGE_SIZE),
    })) as Array<{ itemKey: string; currentDraftSha256: string | null }>
    for (const row of rows) currentDraftSha256ByItemKey.set(row.itemKey, row.currentDraftSha256)
  }
  const currentAssetBySha256 = new Map<
    string,
    { assetId: string; bytes: number; mediaType: string }
  >()
  const assetFacts = bundle.assets
    .map((asset) => ({
      sha256: asset.sha256,
      bytes: asset.bytes,
      mediaType: asset.mediaType,
    }))
    .sort((left, right) => compare(left.sha256, right.sha256))
  for (let offset = 0; offset < assetFacts.length; offset += IMPORT_PAGE_SIZE) {
    const rows = (await client.query(api.ginkoCms.portability.inspectPortableAssets, {
      assets: assetFacts.slice(offset, offset + IMPORT_PAGE_SIZE),
    })) as Array<{
      sha256: string
      current: { assetId: string; bytes: number; mediaType: string } | null
    }>
    for (const row of rows) {
      if (row.current) currentAssetBySha256.set(row.sha256, row.current)
    }
  }
  const plan = await createPortableDraftImportPlan(bundle, {
    deploymentId: options.deploymentId,
    targetContractSha256: options.targetContractSha256,
    currentDraftSha256ByItemKey,
    currentAssetBySha256,
  })
  if (plan.blockers.length > 0) {
    throw new Error(`Portable import is blocked: ${plan.blockers.join(' ')}`)
  }
  const planId = options.planId ?? randomUUID()
  await client.mutation(api.ginkoCms.portability.createImportPlan, {
    planId,
    payload: plan.payload,
    payloadSha256: plan.payloadSha256,
  })
  for (let offset = 0; offset < plan.items.length; offset += IMPORT_PAGE_SIZE) {
    await client.mutation(api.ginkoCms.portability.appendImportPlanItems, {
      planId,
      payloadSha256: plan.payloadSha256,
      items: plan.items.slice(offset, offset + IMPORT_PAGE_SIZE),
    })
  }
  for (let offset = 0; offset < plan.assets.length; offset += IMPORT_PAGE_SIZE) {
    await client.mutation(api.ginkoCms.portability.appendImportPlanAssets, {
      planId,
      payloadSha256: plan.payloadSha256,
      assets: plan.assets.slice(offset, offset + IMPORT_PAGE_SIZE),
    })
  }
  const sealed = (await client.action(api.ginkoCms.portability.sealImportPlan, {
    planId,
    payloadSha256: plan.payloadSha256,
  })) as { runId: string }
  return { ...plan, planId, runId: sealed.runId, directory }
}

export async function applyPreparedPortableDraftImport(
  client: DirectCmsClient,
  prepared: PreparedPortableDraftImport,
  assetTransfer?: PortableAssetTransferOptions,
) {
  if (prepared.assets.some((asset) => asset.payload.effect === 'upload')) {
    if (!assetTransfer) {
      throw new Error('Portable import assets require authenticated CMS host transfer options.')
    }
    await uploadPreparedPortableDraftImportAssets(prepared, assetTransfer)
  }
  const started = (await client.mutation(api.ginkoCms.portability.beginImportApply, {
    runId: prepared.runId,
    payloadSha256: prepared.payloadSha256,
  })) as { state: string }
  if (started.state === 'applying') {
    for (const item of dependencyOrder(prepared.items)) {
      const document = prepared.documentsByItemKey[item.itemKey]
      if (!document) throw new Error(`Portable plan document ${item.itemKey} is missing.`)
      await client.mutation(api.ginkoCms.portability.applyImportItem, {
        runId: prepared.runId,
        payloadSha256: prepared.payloadSha256,
        itemKey: item.itemKey,
        inputSha256: item.inputSha256,
        document,
      })
    }
  }
  if (started.state !== 'complete') {
    await client.mutation(api.ginkoCms.portability.beginImportVerification, {
      runId: prepared.runId,
      payloadSha256: prepared.payloadSha256,
    })
  }
  return await client.mutation(api.ginkoCms.portability.finalizeImport, {
    runId: prepared.runId,
    payloadSha256: prepared.payloadSha256,
  })
}

function dependencyOrder(items: PortableDraftImportPlan['items']) {
  const byKey = new Map(items.map((item) => [item.itemKey, item]))
  const permanent = new Set<string>()
  const active = new Set<string>()
  const ordered: typeof items = []
  const visit = (itemKey: string) => {
    if (permanent.has(itemKey)) return
    if (active.has(itemKey)) throw new Error('Portable plan dependencies contain a cycle.')
    const item = byKey.get(itemKey)
    if (!item) return
    active.add(itemKey)
    for (const dependency of item.payload.dependencyKeys) visit(dependency)
    active.delete(itemKey)
    permanent.add(itemKey)
    ordered.push(item)
  }
  for (const item of items) visit(item.itemKey)
  return ordered
}

function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}
