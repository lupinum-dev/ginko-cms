import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { ParseMdcBodyResult } from '@lupinum/ginko-content/cms-contract'

type Toc = NonNullable<ParseMdcBodyResult['toc']>
type TocLink = Toc['links'][number]

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
