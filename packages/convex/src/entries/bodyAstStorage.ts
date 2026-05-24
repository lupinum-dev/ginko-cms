import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { MarkdownRoot, Toc, TocLink } from '../lib/cmsContract/types.js'

export function encodePublicBodyAst(bodyAst: MarkdownRoot): string {
  return JSON.stringify(bodyAst)
}

export function decodePublicBodyAst(value: JsonValue | undefined): JsonValue | undefined {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    return value
  }
}

function encodeTocLink(link: TocLink): JsonObject {
  return {
    id: link.id,
    text: link.text,
    depth: link.depth,
    ...(link.children ? { children: link.children.map(encodeTocLink) } : {}),
  }
}

export function encodePublicToc(toc: Toc | null): JsonValue | null {
  if (!toc) return null
  return {
    title: toc.title,
    depth: toc.depth,
    searchDepth: toc.searchDepth,
    links: toc.links.map(encodeTocLink),
  }
}
