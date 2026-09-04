import type { GinkoPublicAssetFact } from '@lupinum/ginko-cms-contract/shared/publicContent.js'

import { throwCmsError } from './errors.js'
import type { QueryOrMutationCtx } from './lib/types.js'

const supportedMediaTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export async function buildPublicAssetFacts(
  ctx: QueryOrMutationCtx,
  refs: Array<{ assetId: string; fieldPath: string }>,
): Promise<GinkoPublicAssetFact[]> {
  if (refs.length > 100) {
    throwCmsError(
      'PUBLIC_ASSET_LIMIT_EXCEEDED',
      'Published entry has more than 100 asset references.',
    )
  }

  const facts: GinkoPublicAssetFact[] = []
  for (const ref of refs) {
    const assetId = ctx.db.normalizeId('assets', ref.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    if (!asset || asset.deletedAt != null) {
      throwCmsError('PUBLIC_ASSET_MISSING', 'Published entry references an unavailable asset.', {
        assetId: ref.assetId,
        fieldPath: ref.fieldPath,
      })
    }
    const url = await ctx.storage.getUrl(asset.storageId)
    if (!url) {
      throwCmsError('PUBLIC_ASSET_MISSING', 'Published asset storage object is unavailable.', {
        assetId: ref.assetId,
      })
    }
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      throwCmsError('PUBLIC_ASSET_URL_INVALID', 'Published asset URL is not credential-free HTTPS.')
    }
    if (!supportedMediaTypes.has(asset.mimeType)) {
      throwCmsError(
        'PUBLIC_ASSET_UNVERIFIED',
        'Published asset has no supported verified media type.',
      )
    }
    facts.push({
      fieldPath: ref.fieldPath,
      assetId: ref.assetId,
      url,
      expiresAt: null,
      mediaType: asset.mimeType as GinkoPublicAssetFact['mediaType'],
      bytes: asset.size,
      sha256: asset.sha256,
    })
  }
  return facts
}
