import type {
  GinkoCollections,
  GinkoRouteBackedCollectionName as GeneratedRouteBackedCollectionName,
} from '#ginko-cms-public-contract'

import type { GinkoPageResult } from '../src/public/index'
import { hrefFor } from '../src/public/index'

type TypeEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false

type TypeAssert<Condition extends true> = Condition

type _GeneratedRouteBackedSmoke = TypeAssert<TypeEqual<GeneratedRouteBackedCollectionName, 'blog'>>

async function assertGinkoPublicTypes() {
  const locale: GinkoCollections['locales'] = 'en'
  void locale
  // @ts-expect-error generated contract should narrow locales.
  const badLocale: GinkoCollections['locales'] = 'de'
  void badLocale

  const entry = {} as GinkoCollections['collections']['blog']['page']
  entry.data.title.toUpperCase()
  // @ts-expect-error generated public entry data should reject field typos.
  void entry.data.titel

  const page = {} as GinkoPageResult<GinkoCollections['collections']['blog']['page'], 'en'>
  if (page.status === 'found') {
    page.page.data.title.toUpperCase()
  }

  hrefFor(entry.route)
}

void assertGinkoPublicTypes
