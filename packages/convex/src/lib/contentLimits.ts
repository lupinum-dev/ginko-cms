import { getDocumentSize } from 'convex/values'

import { throwCmsError } from '../errors.js'

const KIB = 1_024

/**
 * Canonical rich-text limit for every CMS ingestion path.
 *
 * 64 KiB is intentionally large enough for long-form editorial documents while
 * leaving deterministic headroom for three-locale immutable revisions and the
 * 1 MiB Convex document ceiling.
 */
export const MAX_MDC_BODY_BYTES = 64 * KIB

/** A bounded 1,500-result search set stays below Convex's 16 MiB read ceiling. */
export const MAX_SEARCH_TEXT_BYTES = 4 * KIB

export const PUBLIC_SEARCH_SHARD_COUNT = 16
export const PUBLIC_SEARCH_MAX_MATCHES = 1_500
export const PUBLIC_SEARCH_MAX_MATCHES_PER_SHARD = 128

/** Repeated depth-five traversal plus three-locale alternates stays below the 16 MiB read ceiling. */
export const MAX_PUBLIC_STRUCTURAL_BYTES = KIB

/** A complete 1,500-result search set stays below 16 MiB, including index metadata. */
export const MAX_PUBLIC_SEARCH_DOCUMENT_BYTES = 5 * KIB

/** 100 body-free public list payloads stay well below the 16 MiB transaction read ceiling. */
export const MAX_PUBLIC_LIST_PAYLOAD_BYTES = 48 * KIB

export const MAX_CONVEX_DOCUMENT_BYTES = 1 << 20

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) return value
  let bytes = 0
  let result = ''
  for (const character of value) {
    const characterBytes = utf8ByteLength(character)
    if (bytes + characterBytes > maxBytes) break
    result += character
    bytes += characterBytes
  }
  return result.trimEnd()
}

export function boundedSearchText(value: string): string {
  return truncateUtf8(value.replace(/\s+/gu, ' ').trim(), MAX_SEARCH_TEXT_BYTES)
}

export function mdcBodySize(bodyMdc: string) {
  const actualBytes = utf8ByteLength(bodyMdc)
  return {
    actualBytes,
    maxBytes: MAX_MDC_BODY_BYTES,
    allowed: actualBytes <= MAX_MDC_BODY_BYTES,
  }
}

export function assertMdcBodyWithinLimit(
  bodyMdc: string,
  details: { locale?: string; field?: string } = {},
): void {
  const size = mdcBodySize(bodyMdc)
  if (size.allowed) return
  throwCmsError(
    'ENTRY_BODY_TOO_LARGE',
    `Rich content must be at most ${MAX_MDC_BODY_BYTES} UTF-8 bytes.`,
    {
      ...details,
      actualBytes: size.actualBytes,
      maxBytes: size.maxBytes,
    },
  )
}

export function convexDocumentSize(value: Record<string, unknown>): number {
  return getDocumentSize(value as Parameters<typeof getDocumentSize>[0])
}

export function assertConvexDocumentWithinLimit(
  value: Record<string, unknown>,
  details: {
    code: string
    label: string
    entryId?: string
    locale?: string
    maxBytes?: number
  },
): number {
  const actualBytes = convexDocumentSize(value)
  const maxBytes = details.maxBytes ?? MAX_CONVEX_DOCUMENT_BYTES
  if (actualBytes <= maxBytes) return actualBytes
  throwCmsError(details.code, `${details.label} exceeds its supported document-size limit.`, {
    ...(details.entryId ? { entryId: details.entryId } : {}),
    ...(details.locale ? { locale: details.locale } : {}),
    actualBytes,
    maxBytes,
  })
}

export function assertPublicPayloadWithinLimit(
  value: Record<string, unknown>,
  details: { entryId: string; locale: string },
): number {
  const actualBytes = convexDocumentSize(value)
  if (actualBytes <= MAX_PUBLIC_LIST_PAYLOAD_BYTES) return actualBytes
  throwCmsError(
    'PUBLIC_PAYLOAD_TOO_LARGE',
    `Published list data and asset facts must fit within ${MAX_PUBLIC_LIST_PAYLOAD_BYTES} bytes.`,
    {
      ...details,
      actualBytes,
      maxBytes: MAX_PUBLIC_LIST_PAYLOAD_BYTES,
    },
  )
}
