import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  validatePublicMarkdownAst,
  type ParseMdcBodyResult,
  type PortableComponentPolicyV1,
} from '@lupinum/ginko-content/cms-contract'

import type { Doc } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import type { QueryOrMutationCtx } from '../../lib/types.js'

type MarkdownRoot = ParseMdcBodyResult['body']

function componentPolicyFor(collection: Doc<'collections'>): PortableComponentPolicyV1 {
  const settings = collection.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { components: {} }
  }
  const policy = (settings as Record<string, unknown>).componentPolicy
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return { components: {} }
  }
  const components = (policy as Record<string, unknown>).components
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    throwCmsError('PUBLISH_BODY_UNSAFE', 'The collection render policy is invalid.', {
      collection: collection.slug,
    })
  }
  return policy as unknown as PortableComponentPolicyV1
}

export async function assertPublicBodySafe(
  ctx: QueryOrMutationCtx,
  body: MarkdownRoot,
  collection: Doc<'collections'>,
): Promise<void> {
  const validationBody = JSON.parse(JSON.stringify(body)) as MarkdownRoot
  const visit = async (value: unknown): Promise<void> => {
    if (Array.isArray(value)) {
      await Promise.all(value.map(visit))
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const tag = typeof record.tag === 'string' ? record.tag.toLowerCase() : ''
    const props = record.props
    if (['img', 'image', 'proseimg'].includes(tag) && props && typeof props === 'object') {
      const src = (props as Record<string, unknown>).src
      if (typeof src === 'string') {
        const assetId = ctx.db.normalizeId('assets', src)
        const asset = assetId ? await ctx.db.get(assetId) : null
        if (asset && asset.deletedAt == null && /^[a-f0-9]{64}$/.test(asset.sha256)) {
          ;(props as Record<string, unknown>).src = `https://asset.invalid/${String(assetId)}`
        }
      }
    }
    await Promise.all(Object.values(record).map(visit))
  }
  await visit(validationBody)
  const result = validatePublicMarkdownAst(validationBody, componentPolicyFor(collection))
  if (!result.ok) {
    throwCmsError('PUBLISH_BODY_UNSAFE', 'Rich content contains unsafe markup.', {
      collection: collection.slug,
      issues: result.issues as unknown as JsonValue,
    })
  }
}
