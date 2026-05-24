import type {
  GinkoPublicEntry,
  GinkoRoute,
} from '@lupinum/ginko-cms-contract/shared/publicContent.js'

type RouteLike = GinkoRoute | Pick<GinkoPublicEntry, 'route'>

function isEntryLike(value: RouteLike): value is Pick<GinkoPublicEntry, 'route'> {
  return 'route' in value
}

export function hrefFor(routeOrEntry: RouteLike): string {
  const route = isEntryLike(routeOrEntry) ? routeOrEntry.route : routeOrEntry
  return route.href ?? route.path
}

export const routeHref = hrefFor
