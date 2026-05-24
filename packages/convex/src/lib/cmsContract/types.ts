/**
 * Generated from `@lupinum/ginko-content/cms-contract`.
 *
 * Source: ginko-content/packages/content/src/types/content.ts
 *
 * Do not edit by hand. Run `pnpm run sync:cms-contract-vendor`.
 */

/**
 * Convex-safe subset of ginko-content's content runtime types.
 *
 * The canonical file contains Nuxt/runtime ingestion types that Convex must not
 * import. Keep only the shapes stored on CMS rows and returned by the public
 * provider.
 */

export interface MarkdownNode {
  type: string
  tag?: string
  value?: string
  props?: Record<string, unknown>
  content?: unknown
  children?: MarkdownNode[]
  attributes?: Record<string, unknown>
  fmAttributes?: Record<string, unknown>
}

export interface MarkdownRoot {
  type: 'root'
  children: MarkdownNode[]
  props?: Record<string, unknown>
  toc?: Toc
}

export interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

export interface Toc {
  title: string
  depth: number
  searchDepth: number
  links: TocLink[]
}

export type CmsLocaleCode = string

export interface PublicEntryPayload {
  title: string
  description: string | null
  data: Record<string, unknown>
  bodyMdc: string
  bodyAst: MarkdownRoot
  searchText: string
  toc: Toc | null
}
