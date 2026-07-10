/**
 * Generated from `@lupinum/ginko-content/cms-contract`.
 *
 * Source: ginko-content/packages/content/src/cms-contract/index.ts
 *
 * Do not edit by hand. Run `pnpm run sync:cms-contract-vendor`.
 */

export {
  describeId,
  generatePath,
  generateCanonicalKey,
  generateTitle,
  isDraftPath,
  isPartialPath,
  normalizeContentPath,
  normalizeRouteMounts,
  longestMountForPath,
  routeRemainder,
  mountContentPath,
  prefixPathWithLocale,
  stripLocalePrefix,
  refineUrlPart,
  routeToContentPathCandidates,
  pathHasLocalePrefix,
} from './path.js'

export { slugifyUrlSegment } from './slug.js'

export { parseMdcBody, type ParseMdcBodyOptions, type ParseMdcBodyResult } from './mdc.js'

export {
  extractMarkdownText,
  isMarkdownRoot,
  mapMarkdownNode,
  mapMarkdownNodes,
  toMarkdownNode,
  toMarkdownRoot,
} from './markdownTree.js'

export type {
  CmsLocaleCode,
  MarkdownNode,
  MarkdownRoot,
  PublicEntryPayload,
  Toc,
  TocLink,
} from './types.js'
