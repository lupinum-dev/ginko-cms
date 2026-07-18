export const MAX_PUBLIC_TREE_DEPTH = 32

export type PublicTreePathOptions = {
  /** Locale-specific collection prefix, for example `/docs`. */
  pathPrefix?: string | null
  /** A published root slug that canonically maps to the collection prefix. */
  rootSlug?: string | null
}

type PublicPlacementRedirectIssue = {
  message: string
  redirectId: string
  fromPath: string
}

export type PublicPlacementIssue =
  | { code: 'unsafe-slug'; message: string }
  | { code: 'sibling-collision'; message: string; entryId: string }
  | ({ code: 'redirect-source-collision' } & PublicPlacementRedirectIssue)
  | ({ code: 'redirect-prefix-collision' } & PublicPlacementRedirectIssue)
  | { code: 'unreachable-parent'; message: string; entryId: string }
  | { code: 'parent-cycle'; message: string; entryId: string }

export type PublicTreeInvariantCode =
  | 'duplicate-entry-locale'
  | 'duplicate-sibling-slug'
  | 'duplicate-active-redirect'

export class PublicTreeInvariantError extends Error {
  readonly code: PublicTreeInvariantCode

  constructor(code: PublicTreeInvariantCode, message: string) {
    super(message)
    this.name = 'PublicTreeInvariantError'
    this.code = code
  }
}
