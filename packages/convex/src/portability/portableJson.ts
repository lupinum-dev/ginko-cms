import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  canonicalJsonBytes,
  hashCanonicalJson,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'

/**
 * Portable documents reach this boundary only after generation or contract
 * validation. The content package's document type is JSON-safe but lacks the
 * index signature carried by JsonMap, so the structural assertion lives here
 * instead of leaking through every hash, size, and persistence call site.
 */
export async function encodePortableDocument(document: PortableDocumentV1) {
  const json = document as unknown as JsonMap
  return {
    json,
    bytes: canonicalJsonBytes(json),
    sha256: await hashCanonicalJson(json),
  }
}

export async function hashPortableDocument(document: PortableDocumentV1): Promise<string> {
  return (await encodePortableDocument(document)).sha256
}
