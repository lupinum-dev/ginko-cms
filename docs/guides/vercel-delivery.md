# Refresh published content on Vercel

Ginko can refresh public Nuxt pages without rebuilding the website. The CMS
publication transaction activates the approved version and queues a durable
revalidation event. Content authenticates that event; the Vercel adapter then
requests regeneration of the affected HTML and Nuxt payload routes.

Working content stays on authenticated, uncached preview routes. A successful
refresh request is delivery acceptance, not proof that every CDN location is
already serving the latest publication. Keep the UI label **Published** until
website verification confirms the delivered version.

## Start with request-time rendering

For a small CMS site, start with ordinary server rendering and no public cache.
The provider reads the approved publication on each request, so publication does
not require a frontend rebuild. Keep the generated server in the deployment;
`nuxt generate` is a different, static-only profile.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    prerender: {
      crawlLinks: false,
      ignore: ['/api/_content'],
    },
  },
})
```

Content normally adds a build route that discovers public pages. Disabling the
crawler and excluding its API namespace from prerendering keeps both HTML and
query JSON dynamic. Do not add CMS pages or their `/_payload.json` paths to an
explicit prerender list. Content may warn that crawling is disabled; that is
intentional for this server-rendered CMS profile. These are native
[Nuxt prerender controls](https://nuxt.com/docs/4.x/getting-started/prerendering),
not a change to the provider or its publication rules.

`content.agent.delivery: 'runtime'` alone is insufficient here: it removes
prerendered HTML but deliberately retains generated query and payload files.
Such files can continue returning the old publication. If the host enables
agent-readable output or adds other prerendered routes, verify those outputs
separately. A filesystem-backed static site should keep its own generation profile.

Before deployment, confirm that `.output/public` contains no CMS page HTML,
CMS query JSON, or corresponding Nuxt payloads. Warm a page and its exact query
URL, publish through Studio, then request those same URLs without rebuilding.
The next working edit must remain private. Enable public caching only after
this baseline passes and its invalidation is configured.

## Add Vercel ISR when needed

Use ISR for public content routes, with server rendering available. Files emitted
by a static-only `nuxt generate` deployment cannot be updated by this adapter.
Do not prerender or cache Studio, authenticated preview, or auth/API routes.
These settings belong to the Vercel deployment profile. Local server-rendered
development can leave `content.cache` disabled; it does not need a Vercel token.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  content: {
    cache: '~/server/content-cache',
    revalidate: {
      token: process.env.GINKO_REVALIDATE_TOKEN,
    },
  },
  nitro: {
    preset: 'vercel',
    prerender: { crawlLinks: false, ignore: ['/api/_content'] },
    vercel: {
      config: { bypassToken: process.env.VERCEL_ISR_BYPASS_TOKEN },
    },
  },
  routeRules: {
    '/': { isr: true },
    '/blog': { isr: true },
    '/blog/**': { isr: true },
    '/landing/**': { isr: true },
    '/de/blog/**': { isr: true },
    '/de/landing/**': { isr: true },
    '/preview/**': {
      prerender: false,
      isr: false,
      cache: false,
      headers: {
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
  },
})
```

```ts
// server/content-cache.ts
import { vercelContentCache } from '@lupinum/ginko-cms/nuxt-provider'

export default vercelContentCache({
  origin: 'https://www.example.com',
  bypassToken: process.env.VERCEL_ISR_BYPASS_TOKEN ?? '',
  isPublicPath: (path) =>
    path === '/' || path === '/blog' || /^\/(?:de\/)?(?:blog|landing)\//u.test(path),
  pathsForTags: (tags) => (tags.includes('collection:blog') ? ['/blog', '/'] : []),
})
```

Adapt the public route predicate and affected listing paths to the actual site.
Include all language variants and every cached page that consumes shared content.
For example, a footer singleton needs a mapping to all public pages using that
footer. Tags are not automatically Vercel cache tags: this adapter uses explicit
path regeneration. A tag-only event without a resolved path fails visibly instead
of falsely reporting success. Batches are limited to 100 resolved page paths.

Configure the CMS website-refresh target to
`https://www.example.com/api/_content/revalidate`. Its secret environment variable
must contain the same `GINKO_REVALIDATE_TOKEN` in the Convex host. Keep signed
requests required (the default). The ISR bypass token is a **different** credential:
it must be available in the Nuxt server environment and match the value used when
Nitro builds the Vercel prerender configuration. Never put either token in public
runtime config, browser code, URLs, logs, or the committed repository.

Use the canonical domain directly. Vercel invalidation is scoped to the domain and
deployment receiving the request; other domains and deployments need their own
delivery arrangement. The adapter never derives an origin from incoming headers
and never follows redirects with a credential.

## Retries and version safety

- The existing Content endpoint checks the exact signed body, event id, and a
  bounded timestamp window before invoking the adapter.
- The existing CMS outbox owns retries, backoff, expired lease recovery, and
  generation fencing. A stale worker cannot acknowledge a newer attempt.
- Duplicate or out-of-order events are safe because they contain paths, not
  historical page data. Every regeneration reads the current approved publication.
  There is no second delivery database or in-memory “already handled” authority.
- The adapter requests regeneration with `HEAD` for each page and its
  `/_payload.json` separately, with at
  most four requests in flight and a 7.5-second batch deadline. It adds no second
  browser cache TTL.
- Upstream errors and timeouts fail the endpoint so the CMS retries. A partial
  batch retries in full. Redirects, a removed page (404/410), and a missing extracted
  payload are valid renderer responses; requests never follow those redirects.
- Public rendering must always resolve current publication pointers. Do not put
  another indefinitely cached provider/API layer beneath ISR. If the host adds
  such a layer, its invalidation must finish before ISR regeneration.

## Verification

Local tests exercise the installed Content endpoint, real CMS HMAC generation,
adapter requests, unsafe path rejection, duplicates, ordering, and failure/retry.
The existing outbox tests cover durable lease and retry behavior:

```sh
pnpm exec vitest run test/shared/vercel-content-cache.test.ts test/component/revalidation.test.ts
```

Hosted verification remains a separate approval gate. After an authorized Vercel
deployment, check the generated `.prerender-config.json` files and test all of:
published HTML and extracted payload update without rebuilding; a subsequent
working change stays private; old-slug redirects and unpublishing refresh; listing
and global consumers refresh; anonymous preview HTML/payload is private; expired
and invalid signatures fail; transient delivery failure recovers. Verify the
published revision through a public request before describing it as **Live**.

The adapter follows Vercel's documented
[Nitro on-demand revalidation](https://vercel.com/docs/frameworks/backend/nitro)
(`x-prerender-revalidate`) and
[ISR deployment/domain scope](https://vercel.com/docs/incremental-static-regeneration).
Implementation was also checked against the installed Nitro 2.13.4 Vercel preset,
which writes `vercel.config.bypassToken` into ISR prerender configuration.
