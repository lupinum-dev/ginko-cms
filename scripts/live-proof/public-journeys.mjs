import { assertNoDraftProjection, contentApiPath, summarizePublicEntries } from './public-api.mjs'

export async function runPublicJourneys({
  story,
  page,
  baseUrl,
  collection,
  fixtureToken,
  certification,
  fixtureManifest,
  fetchJson,
  redact,
}) {
  let publicContentFixture = null
  await story('public-api.list', 'Public API lists only published entries', async () => {
    const path = contentApiPath('query', {
      collection,
      resolveLocale: { locale: 'en', exact: true },
      sort: [{ lastPublishedAt: -1 }],
      limit: 2,
    })
    const { response, body, text } = await fetchJson(path)
    if (!response.ok) {
      throw new Error(`public list failed ${response.status}: ${redact(text).slice(0, 300)}`)
    }
    const summary = summarizePublicEntries(body)
    if (summary.count < 1) throw new Error('public list returned no entries')
    if (!summary.firstPath || !summary.firstTitle) {
      throw new Error('public list entry did not include a route path and title')
    }
    publicContentFixture = summary
    assertNoDraftProjection('public list', body)
    return summary
  })

  await story('public-page.blog', 'Public blog renders the published list and detail', async () => {
    if (!publicContentFixture) throw new Error('public list evidence is unavailable')
    await page.goto(`${baseUrl}/blog`, { waitUntil: 'domcontentloaded' })
    const postLink = page.getByRole('link', { name: publicContentFixture.firstTitle })
    await postLink.waitFor({ timeout: 30000 })
    const href = await postLink.getAttribute('href')
    if (href !== publicContentFixture.firstPath) {
      throw new Error(`public blog linked to ${href || 'no route'}`)
    }
    await postLink.click()
    await page
      .getByRole('heading', { level: 1, name: publicContentFixture.firstTitle })
      .waitFor({ timeout: 30000 })
    return { path: page.url().replace(baseUrl, ''), title: publicContentFixture.firstTitle }
  })

  await story(
    'public-page.not-found',
    'Public content pages preserve HTTP 404 status',
    async () => {
      const missingPath = `/blog/missing-${fixtureToken}`
      const response = await fetch(`${baseUrl}${missingPath}`)
      if (response.status !== 404) {
        throw new Error(`missing public blog page returned ${response.status}`)
      }
      return { path: missingPath, status: response.status }
    },
  )

  if (certification) {
    await story(
      'public-route.structural-redirect',
      'Moved subtree resolves at its target and preserves a bounded redirect',
      async () => {
        const probe = fixtureManifest.probes.routeRedirect
        const source = await fetch(`${baseUrl}${probe.sourcePath}`, { redirect: 'manual' })
        const location = source.headers.get('location')
        if (![301, 302, 307, 308].includes(source.status)) {
          throw new Error(`structural redirect returned ${source.status}`)
        }
        if (new URL(location, baseUrl).pathname !== probe.targetPath) {
          throw new Error(`structural redirect targeted ${location ?? '(missing)'}`)
        }
        const target = await fetch(`${baseUrl}${probe.targetPath}`)
        if (!target.ok) throw new Error(`moved subtree target returned ${target.status}`)
        return { source: probe.sourcePath, target: probe.targetPath, status: source.status }
      },
    )
  }

  await story('public-api.nav', 'Public API navigation returns published routes only', async () => {
    const { response, body, text } = await fetchJson(
      `/api/_content/navigation?collection=${collection}&locale=en`,
    )
    if (!response.ok) {
      throw new Error(`public nav failed ${response.status}: ${redact(text).slice(0, 300)}`)
    }
    if (!Array.isArray(body) || body.length < 1)
      throw new Error('public nav returned no tree entries')
    assertNoDraftProjection('public nav', body)
    const firstRoute = body[0]?.path ?? null
    if (!firstRoute) throw new Error('public nav entry did not include a route path')
    return { count: body.length, firstRoute }
  })

  await story(
    'public-api.search',
    'Public API respects the collection search contract',
    async () => {
      if (!publicContentFixture) throw new Error('public list evidence is unavailable')
      const { response, body, text } = await fetchJson(
        `/api/_content/search?q=${encodeURIComponent(publicContentFixture.firstTitle)}&locale=en`,
      )
      if (!response.ok) {
        throw new Error(`public search failed ${response.status}: ${redact(text).slice(0, 300)}`)
      }
      if (!Array.isArray(body)) throw new Error('public search returned an invalid shape')
      if (!body.some((result) => result?.path === publicContentFixture.firstPath)) {
        throw new Error('public search did not return the published entry from public list')
      }
      assertNoDraftProjection('public search', body)
      return { count: body.length, firstPath: body[0]?.path ?? null }
    },
  )

  await story('public-api.sitemap', 'Public API sitemap returns published URLs only', async () => {
    const { response, body, text } = await fetchJson(`/api/_content/sitemap?include=${collection}`)
    if (!response.ok) {
      throw new Error(`public sitemap failed ${response.status}: ${redact(text).slice(0, 300)}`)
    }
    if (!Array.isArray(body) || body.length < 1) throw new Error('public sitemap returned no URLs')
    assertNoDraftProjection('public sitemap', body)
    const firstRoute = body[0]?.loc ?? null
    if (!firstRoute) throw new Error('public sitemap entry did not include a route path')
    const sampleIndexes = [0, Math.floor(body.length / 2), body.length - 1]
    const sampledRoutes = [
      ...new Set([
        publicContentFixture?.firstPath,
        ...sampleIndexes.map((index) => body[index]?.loc),
      ]),
    ].filter((path) => typeof path === 'string' && path.length > 0)
    const routeResponses = await Promise.all(
      sampledRoutes.map(async (path) => ({
        path,
        status: (await fetch(`${baseUrl}${path}`)).status,
      })),
    )
    const brokenRoute = routeResponses.find((entry) => entry.status !== 200)
    if (brokenRoute) {
      throw new Error(`public sitemap route ${brokenRoute.path} returned ${brokenRoute.status}`)
    }
    return { count: body.length, firstRoute, checkedRoutes: routeResponses.length }
  })

  if (certification) {
    await story(
      'scale.public-routes-target-fixture',
      'Public route enumeration covers every target-scale live publication',
      async () => {
        const probe = fixtureManifest.probes.publicRoutes
        const { response, body, text } = await fetchJson('/api/_content/sitemap')
        if (!response.ok) {
          throw new Error(`target sitemap failed ${response.status}: ${redact(text).slice(0, 300)}`)
        }
        if (!Array.isArray(body)) throw new Error('target sitemap returned an invalid shape')
        const fixtureRoutes = body.filter((entry) => {
          const path = entry?.loc
          return (
            typeof path === 'string' && probe.pathPrefixes.some((prefix) => path.startsWith(prefix))
          )
        })
        if (fixtureRoutes.length !== probe.expectedRows) {
          throw new Error(
            `target sitemap returned ${fixtureRoutes.length} fixture rows; expected ${probe.expectedRows}`,
          )
        }
        if (!fixtureRoutes.some((entry) => entry.loc === probe.deepestPath)) {
          throw new Error(`target sitemap omitted depth-five route ${probe.deepestPath}`)
        }
        const depth = new URL(probe.deepestPath, baseUrl).pathname.split('/').filter(Boolean).length
        if (depth < fixtureManifest.targetScale.treeDepth) {
          throw new Error(`deepest public fixture has depth ${depth}, expected at least 5`)
        }
        return {
          rows: fixtureRoutes.length,
          deepestPath: probe.deepestPath,
          depth,
          prefixes: probe.pathPrefixes,
        }
      },
    )
  }

  await story(
    'public-api.search-validation',
    'Public API treats an omitted search term as an empty search',
    async () => {
      const { response, body } = await fetchJson('/api/_content/search?locale=en')
      if (response.status !== 200)
        throw new Error(`missing search query returned ${response.status}`)
      if (!Array.isArray(body) || body.length !== 0) {
        throw new Error('missing search query did not return an empty result')
      }
      return { status: response.status, rows: body.length }
    },
  )
}
