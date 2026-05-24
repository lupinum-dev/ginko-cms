import type {
  GinkoCollectionContract,
  GinkoRouteBackedCollectionName,
} from '../src/publicContent.js'

type TypeEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false

type TypeAssert<Condition extends true> = Condition

type RouteBackedSmokeContract = {
  locales: 'en'
  collections: {
    blog: GinkoCollectionContract & { routeBacked: true }
    authors: GinkoCollectionContract & { routeBacked: false }
  }
  singletons: Record<string, never>
  siteData: Record<string, never>
}

type _RouteBackedSmoke = TypeAssert<
  TypeEqual<GinkoRouteBackedCollectionName<RouteBackedSmokeContract>, 'blog'>
>
