import { jsonValueValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { CmsField, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentCollectionV1,
  type ResolvedContentContractV1,
  type ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'
import { v } from 'convex/values'

import { scheduleCollectionReindex } from './collections/jobs.js'
import { syncCodeDefinedCollectionContracts } from './collections/sync.js'
import { mutation, query } from './functions.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'

export const installCmsPolicyArgs = {
  contract: jsonValueValidator,
  contractSha256: v.string(),
}

export const installCmsPolicyReturns = v.object({
  contractSha256: v.string(),
  collectionCount: v.number(),
  localeCount: v.number(),
  created: v.number(),
  updated: v.number(),
  skipped: v.number(),
  missingFromConfig: v.array(v.string()),
})

export const checkCmsPolicyReturns = v.object({
  matches: v.boolean(),
  installedContractSha256: v.union(v.string(), v.null()),
  expectedContractSha256: v.string(),
  drift: v.array(
    v.object({
      path: v.string(),
      installed: v.optional(jsonValueValidator),
      expected: v.optional(jsonValueValidator),
    }),
  ),
})

function titleize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function fieldProjection(field: ResolvedContentFieldV1): CmsField {
  return {
    key: field.key,
    type: field.type,
    label: titleize(field.key),
    required: field.required,
    localized: field.localized,
    searchable: field.searchable,
    sortable: field.sortable,
    ...(field.default.present ? { defaultValue: field.default.value } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(field.relation
      ? { relation: { collectionId: field.relation.collection, multiple: field.relation.multiple } }
      : {}),
    ...(field.media
      ? { media: { accept: field.media.mediaTypes, aspectRatio: field.media.aspectRatio } }
      : {}),
    ...(field.fields ? { fields: field.fields.map(fieldProjection) } : {}),
    ...(field.validation ? { validation: field.validation } : {}),
    ...(field.min !== null ? { min: field.min } : {}),
    ...(field.max !== null ? { max: field.max } : {}),
    ...(field.step !== null ? { step: field.step } : {}),
    ...(field.slugFrom !== null ? { slugFrom: field.slugFrom } : {}),
    ...(field.language !== null ? { language: field.language } : {}),
  }
}

function collectionSettings(collection: ResolvedContentCollectionV1): JsonValue {
  return {
    defaultLocale: collection.defaultLocale,
    localizedPathPrefixes: collection.routing.localizedPathPrefixes,
    localizedSingletonPaths: collection.routing.localizedSingletonPaths,
    allowMultipleRoots: collection.routing.allowMultipleRoots,
    portable: collection.portable,
    componentPolicy: collection.componentPolicy,
  } as unknown as JsonValue
}

function collectionProjection(collection: ResolvedContentCollectionV1) {
  return {
    slug: collection.id,
    label: titleize(collection.id),
    type: collection.structure,
    routing: {
      mode: collection.routing.mode,
      pathPrefix: collection.routing.pathPrefix,
      slugMode: collection.routing.slugMode,
      rootSlug: collection.routing.rootSlug,
      singleton: collection.routing.singleton,
    },
    locales: collection.locales,
    fields: collection.fields.map(fieldProjection),
    settings: collectionSettings(collection),
  }
}

async function replaceDerivedLocales(
  ctx: MutationCtx,
  contract: ResolvedContentContractV1,
  now: number,
) {
  const existing = await ctx.db
    .query('cmsSettings')
    .withIndex('by_key', (query) => query.eq('key', 'site'))
    .first()
  const locales = contract.locales.map((code) => ({
    code,
    label: code,
    ...(code === contract.defaultLocale ? { isDefault: true } : {}),
    ...(contract.localeFallbacks[code]?.[0] ? { fallback: contract.localeFallbacks[code][0] } : {}),
  }))
  if (existing) {
    await ctx.db.patch(existing._id, { locales, updatedBy: 'deployment', updatedAt: now })
  } else {
    await ctx.db.insert('cmsSettings', {
      key: 'site',
      locales,
      webhooks: [],
      updatedBy: 'deployment',
      updatedAt: now,
    })
  }
}

export async function installCmsPolicyHandler(
  ctx: MutationCtx,
  args: { contract: JsonValue; contractSha256: string },
) {
  const contract = assertResolvedContentContract(args.contract)
  const computedSha256 = await hashCanonicalJson(args.contract)
  if (computedSha256 !== args.contractSha256) throw new Error('CMS_POLICY_HASH_MISMATCH')

  const now = Date.now()
  const existing = await ctx.db
    .query('cmsPolicies')
    .withIndex('by_key', (query) => query.eq('key', 'active'))
    .first()
  if (existing) {
    await ctx.db.patch(existing._id, {
      contract: args.contract,
      contractSha256: args.contractSha256,
      installedAt: now,
      installedBy: 'deployment',
    })
  } else {
    await ctx.db.insert('cmsPolicies', {
      key: 'active',
      contract: args.contract,
      contractSha256: args.contractSha256,
      installedAt: now,
      installedBy: 'deployment',
    })
  }

  await replaceDerivedLocales(ctx, contract, now)
  const sync = await syncCodeDefinedCollectionContracts(
    ctx,
    {
      collections: Object.values(contract.collections).map(collectionProjection),
    },
    'deployment',
    args.contractSha256,
  )
  if (existing && existing.contractSha256 !== args.contractSha256) {
    for (const collection of await ctx.db.query('collections').collect()) {
      await scheduleCollectionReindex(ctx, collection._id, 'deployment', args.contractSha256)
    }
  }

  return {
    contractSha256: args.contractSha256,
    collectionCount: Object.keys(contract.collections).length,
    localeCount: contract.locales.length,
    ...sync,
  }
}

function contractDrift(
  installed: JsonValue | undefined,
  expected: JsonValue,
  path = '$',
): Array<{
  path: string
  installed?: JsonValue
  expected?: JsonValue
}> {
  if (JSON.stringify(installed) === JSON.stringify(expected)) return []
  if (Array.isArray(installed) && Array.isArray(expected)) {
    const drift: ReturnType<typeof contractDrift> = []
    const length = Math.max(installed.length, expected.length)
    for (let index = 0; index < length; index += 1) {
      if (index >= expected.length) {
        drift.push({ path: `${path}[${index}]`, installed: installed[index] })
      } else if (index >= installed.length) {
        drift.push({ path: `${path}[${index}]`, expected: expected[index]! })
      } else {
        drift.push(...contractDrift(installed[index], expected[index]!, `${path}[${index}]`))
      }
    }
    return drift
  }
  if (
    installed &&
    expected &&
    typeof installed === 'object' &&
    typeof expected === 'object' &&
    !Array.isArray(installed) &&
    !Array.isArray(expected)
  ) {
    const drift: ReturnType<typeof contractDrift> = []
    const keys = new Set([...Object.keys(installed), ...Object.keys(expected)])
    for (const key of [...keys].sort((left, right) => left.localeCompare(right))) {
      const installedValue = installed[key]
      const expectedValue = expected[key]
      if (expectedValue === undefined)
        drift.push({ path: `${path}.${key}`, installed: installedValue })
      else if (installedValue === undefined)
        drift.push({ path: `${path}.${key}`, expected: expectedValue })
      else drift.push(...contractDrift(installedValue, expectedValue, `${path}.${key}`))
    }
    return drift
  }
  return [{ path, ...(installed !== undefined ? { installed } : {}), expected }]
}

export async function checkCmsPolicyHandler(
  ctx: QueryOrMutationCtx,
  args: { contract: JsonValue; contractSha256: string },
) {
  assertResolvedContentContract(args.contract)
  const computedSha256 = await hashCanonicalJson(args.contract)
  if (computedSha256 !== args.contractSha256) throw new Error('CMS_POLICY_HASH_MISMATCH')
  const installed = await ctx.db
    .query('cmsPolicies')
    .withIndex('by_key', (query) => query.eq('key', 'active'))
    .first()
  return {
    matches: installed?.contractSha256 === args.contractSha256,
    installedContractSha256: installed?.contractSha256 ?? null,
    expectedContractSha256: args.contractSha256,
    drift: contractDrift(installed?.contract as JsonValue | undefined, args.contract),
  }
}

export const installCmsPolicy = mutation({
  args: installCmsPolicyArgs,
  returns: installCmsPolicyReturns,
  handler: async (ctx, args) => await installCmsPolicyHandler(ctx, args),
})

export const checkCmsPolicy = query({
  args: installCmsPolicyArgs,
  returns: checkCmsPolicyReturns,
  handler: async (ctx, args) => await checkCmsPolicyHandler(ctx, args),
})
