import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'

import { throwCmsError } from '../errors.js'

/**
 * Sanitize a user-provided filename for safe storage.
 *
 * - Strips path separators (`/`, `\`)
 * - Strips null bytes and control characters (0x00-0x1F)
 * - Trims whitespace
 * - Limits length to 255 characters
 * - Returns `"unnamed"` if the result is empty
 */
export function sanitizeFilename(raw: string): string {
  let name = raw
  // Strip control characters (0x00-0x1F) including null bytes
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\x00-\x1F]/g, '')
  // Replace path separators with underscores
  name = name.replace(/[/\\]/g, '_')
  // Trim whitespace
  name = name.trim()
  // Limit length to 255 characters
  if (name.length > 255) {
    name = name.slice(0, 255)
  }
  // Fall back to "unnamed" if empty
  if (name.length === 0) {
    return 'unnamed'
  }
  return name
}

const MIME_TYPE_PATTERN = /^[a-z0-9][\w!#$&\-^.+]*\/[a-z0-9][\w!#$&\-^.+]*$/i
const ALLOWED_ASSET_MIME_TYPE_SET = new Set<string>(ALLOWED_ASSET_MIME_TYPES)

/**
 * Validate that a MIME type matches the `type/subtype` format.
 * Throws a CMS error if the value is empty or malformed.
 */
export function validateMimeType(mimeType: string): void {
  if (!mimeType || !MIME_TYPE_PATTERN.test(mimeType)) {
    throwCmsError('ASSET_MIME_INVALID', `Invalid MIME type: "${mimeType}"`, {
      mimeType,
    })
  }
}

export function validateAssetUploadPolicy(input: { mimeType: string; size: number }): {
  mimeType: string
  size: number
} {
  validateMimeType(input.mimeType)

  const normalizedMimeType = input.mimeType.toLowerCase()
  if (!ALLOWED_ASSET_MIME_TYPE_SET.has(normalizedMimeType)) {
    throwCmsError(
      'ASSET_MIME_NOT_ALLOWED',
      `Unsupported asset MIME type: "${input.mimeType}". Allowed MIME types: ${ALLOWED_ASSET_MIME_TYPES.join(', ')}.`,
      {
        allowedMimeTypes: [...ALLOWED_ASSET_MIME_TYPES],
        mimeType: input.mimeType,
      },
    )
  }

  if (
    !Number.isFinite(input.size) ||
    input.size <= 0 ||
    input.size > MAX_ASSET_SIZE_BYTES ||
    !Number.isInteger(input.size)
  ) {
    throwCmsError('ASSET_SIZE_INVALID', 'Asset size is outside the allowed range.', {
      size: input.size,
      maxSize: MAX_ASSET_SIZE_BYTES,
    })
  }

  return {
    mimeType: normalizedMimeType,
    size: input.size,
  }
}
