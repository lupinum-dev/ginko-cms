import { randomUUID } from 'node:crypto'

import { hashCanonicalJson } from '@lupinum/ginko-content/portability'
import type { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import {
  uploadPreparedPortableDraftImportAssets,
  type PortableAssetTransferOptions,
} from './asset-transport.js'
import { readCmsPortableDirectory } from './directory.js'
import { createPortableDraftImportPlan, type PortableDraftImportPlan } from './plan.js'

const api = anyApi
const PAGE_SIZE = 250

type DirectCmsClient = Pick<ConvexHttpClient, 'query' | 'mutation' | 'action'>

export type PreparedPortableDraftImport = PortableDraftImportPlan & {
  planId: string
  runId: string
  directory: string
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
  for (let offset = 0; offset < identities.length; offset += PAGE_SIZE) {
    const rows = (await client.query(api.ginkoCms.portability.inspectPortableDrafts, {
      items: identities.slice(offset, offset + PAGE_SIZE),
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
  for (let offset = 0; offset < assetFacts.length; offset += PAGE_SIZE) {
    const rows = (await client.query(api.ginkoCms.portability.inspectPortableAssets, {
      assets: assetFacts.slice(offset, offset + PAGE_SIZE),
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
  for (let offset = 0; offset < plan.items.length; offset += PAGE_SIZE) {
    await client.mutation(api.ginkoCms.portability.appendImportPlanItems, {
      planId,
      payloadSha256: plan.payloadSha256,
      items: plan.items.slice(offset, offset + PAGE_SIZE),
    })
  }
  for (let offset = 0; offset < plan.assets.length; offset += PAGE_SIZE) {
    await client.mutation(api.ginkoCms.portability.appendImportPlanAssets, {
      planId,
      payloadSha256: plan.payloadSha256,
      assets: plan.assets.slice(offset, offset + PAGE_SIZE),
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
