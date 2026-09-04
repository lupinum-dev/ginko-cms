// Shared helpers for the UI shell migration audit harness.
//
// This module never prints credentials. CMS_SMOKE_EMAIL / CMS_SMOKE_PASSWORD
// are read from the environment (load them with `node --env-file-if-exists=.env.local`).

import { spawn } from 'node:child_process'

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/** Trim trailing slashes from a base URL, e.g. "http://x:3000/" -> "http://x:3000". */
export function normalizeBase(base) {
  return String(base).replace(/\/+$/, '')
}

/** Normalize the studio mount prefix, e.g. "cms" | "/cms/" -> "/cms". "" -> "". */
export function normalizeStudio(studio) {
  const raw = String(studio ?? '').trim()
  if (!raw || raw === '/') return ''
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.replace(/\/+$/, '')
}

/**
 * Build an absolute Studio URL.
 * @param {{base:string, studio:string}} ctx
 * @param {string} path route path relative to the studio mount, e.g. "" | "/model" | "/content/blog"
 */
export function studioUrl(ctx, path) {
  const suffix = !path || path === '/' ? '' : path.startsWith('/') ? path : `/${path}`
  return `${ctx.base}${ctx.studio}${suffix}`
}

// ---------------------------------------------------------------------------
// Route matrix
// ---------------------------------------------------------------------------

// Logical route keys keep screenshot filenames stable across runs even though
// the concrete :collection / :id segments are discovered at runtime — so a
// baseline captured today diffs cleanly against a candidate captured later.
export const STATIC_ROUTES = [
  { key: 'home', path: '' },
  { key: 'model', path: '/model' },
  { key: 'assets', path: '/assets' },
  { key: 'activity', path: '/activity' },
  { key: 'agents', path: '/agents' },
  { key: 'reviews', path: '/reviews' },
  { key: 'settings', path: '/settings' },
  { key: 'site-data', path: '/site-data' },
]

export const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

export const MODES = ['light', 'dark']

// Determinism: kill animations, transitions, the text caret, and smooth
// scrolling so repeat captures are byte-stable. Timestamps are neutralized to
// transparent so their glyphs don't churn the diff while preserving layout box.
export const DETERMINISM_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
time, [datetime], [data-testid$="-timestamp"], [data-relative-time] {
  color: transparent !important;
}`

export const DETERMINISM_NOTES = [
  'Animations, transitions, caret, and smooth-scroll disabled via injected CSS.',
  'Timestamp elements (time/[datetime]/[data-relative-time]) rendered transparent to keep layout but hide churning glyphs.',
  'Volatile regions NOT masked and may cause diff noise: activity feed contents, agent session lists, review queues, relative "x minutes ago" strings inside non-time elements, and any user avatars.',
  'Full-page screenshots are used, so total image height tracks content height; large content changes shift pixels below the fold.',
]

// ---------------------------------------------------------------------------
// Auth (mirrors scripts/cms-live-story-smoke.mjs sign-in pattern)
// ---------------------------------------------------------------------------

export function requireCredentials() {
  const email = process.env.CMS_SMOKE_EMAIL
  const password = process.env.CMS_SMOKE_PASSWORD
  if (!email || !password) {
    throw new Error(
      'ui-audit capture requires CMS_SMOKE_EMAIL and CMS_SMOKE_PASSWORD (load .env.local with --env-file-if-exists=.env.local).',
    )
  }
  return { email, password }
}

/**
 * Programmatic sign-in against the Studio auth page. Returns true on success.
 * Never logs the credentials or the raw response body.
 */
export async function signIn(page, ctx, credentials) {
  const redirect = `${ctx.studio}/settings` || '/settings'
  const url = studioUrl(ctx, `/auth/signin?redirect=${encodeURIComponent(redirect)}`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page
    .locator('[data-testid="cms-auth-form"][data-auth-ready="true"]')
    .waitFor({ timeout: 30000 })
  await page.getByTestId('cms-auth-email').fill(credentials.email)
  await page.getByTestId('cms-auth-password').fill(credentials.password)
  const responsePromise = page
    .waitForResponse((r) => r.url().includes('/api/auth/sign-in/email'), { timeout: 30000 })
    .catch(() => null)
  await page.getByTestId('cms-auth-submit').click()
  const response = await responsePromise
  if (!response || !response.ok()) return false
  // Wait until we've left the sign-in page.
  await page
    .waitForFunction(() => !location.pathname.includes('/auth/signin'), null, { timeout: 30000 })
    .catch(() => {})
  await page.waitForTimeout(1500)
  return true
}

// ---------------------------------------------------------------------------
// Navigation + settle
// ---------------------------------------------------------------------------

/**
 * Navigate to a studio route and wait for it to settle. Returns
 * { ok, reason }. `ok:false` means the route could not be reached (e.g. it
 * bounced to sign-in) and the caller should record it as skipped.
 */
export async function gotoAndSettle(page, ctx, path, { settleMs = 700, timeout = 45000 } = {}) {
  const url = studioUrl(ctx, path)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  } catch (error) {
    return { ok: false, reason: `navigation error: ${shortError(error)}`, url }
  }
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {})
  // Bounced back to auth => not reachable in this session.
  if (page.url().includes('/auth/signin')) {
    return { ok: false, reason: 'redirected to sign-in (not authenticated / no access)', url }
  }
  await page.waitForTimeout(settleMs)
  return { ok: true, reason: null, url: page.url() }
}

// ---------------------------------------------------------------------------
// Runtime discovery of a content collection + entry
// ---------------------------------------------------------------------------

/**
 * Discover the first collection with at least one entry and that entry's id.
 * Honors CMS_AUDIT_COLLECTION / CMS_AUDIT_ENTRY_ID overrides.
 * Returns { collection, entryId, source, reason } — any field may be null.
 */
export async function discoverContentTargets(page, ctx) {
  const envCollection = process.env.CMS_AUDIT_COLLECTION?.trim() || null
  const envEntryId = process.env.CMS_AUDIT_ENTRY_ID?.trim() || null

  // Load a studio page so the sidebar nav (with /content/<slug> links) exists.
  const landed = await gotoAndSettle(page, ctx, '')
  if (!landed.ok) {
    return { collection: envCollection, entryId: envEntryId, source: 'env', reason: landed.reason }
  }

  let candidates = []
  if (envCollection) {
    candidates = [envCollection]
  } else {
    candidates = await collectionSlugsFromPage(page, ctx)
  }

  for (const collection of candidates) {
    const listReached = await gotoAndSettle(page, ctx, `/content/${collection}`)
    if (!listReached.ok) continue

    if (envCollection && envEntryId) {
      return { collection, entryId: envEntryId, source: 'env', reason: null }
    }

    const entryId = await firstEntryIdOnList(page, collection)
    if (entryId) {
      return { collection, entryId: envEntryId ?? entryId, source: 'discovered', reason: null }
    }
    // Collection reachable but empty; if it was env-forced, still return it so
    // list/new routes can be captured even without an entry.
    if (envCollection) {
      return { collection, entryId: envEntryId, source: 'env', reason: 'no entries found in list' }
    }
  }

  return {
    collection: envCollection,
    entryId: envEntryId,
    source: envCollection ? 'env' : 'discovered',
    reason: 'no collection with entries could be discovered',
  }
}

async function collectionSlugsFromPage(page, ctx) {
  const studioContent = `${ctx.studio}/content/`
  const hrefs = await page
    .$$eval('a[href*="/content/"]', (els) => els.map((el) => el.getAttribute('href') || ''))
    .catch(() => [])
  const slugs = []
  for (const href of hrefs) {
    // Match ".../content/<slug>" optionally followed by more path.
    const idx = href.indexOf('/content/')
    if (idx === -1) continue
    const after = href.slice(idx + '/content/'.length)
    const slug = after.split(/[/?#]/)[0]
    if (!slug || slug === 'new') continue
    if (!slugs.includes(slug)) slugs.push(slug)
  }
  void studioContent
  return slugs
}

async function firstEntryIdOnList(page, collection) {
  // Preferred: an entry row exposes an anchor to /content/<collection>/<id>.
  const fromAnchor = await page
    .$$eval(
      `a[href*="/content/${collection}/"]`,
      (els, coll) => {
        for (const el of els) {
          const href = el.getAttribute('href') || ''
          const idx = href.indexOf(`/content/${coll}/`)
          if (idx === -1) continue
          const seg = href.slice(idx + `/content/${coll}/`.length).split(/[/?#]/)[0]
          if (seg && seg !== 'new') return seg
        }
        return null
      },
      collection,
    )
    .catch(() => null)
  if (fromAnchor) return fromAnchor

  // Fallback: click the first entry row and read the resulting id from the URL.
  const row = page.locator('[data-testid="cms-entry-row"]').first()
  if ((await row.count().catch(() => 0)) === 0) return null
  try {
    await row.click({ timeout: 10000 })
    await page.waitForURL(new RegExp(`/content/${escapeRe(collection)}/(?!new)[^/?#]+`), {
      timeout: 15000,
    })
    const m = page.url().match(new RegExp(`/content/${escapeRe(collection)}/([^/?#]+)`))
    return m && m[1] !== 'new' ? m[1] : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Optional dev-server bootstrap (only with --start; off by default)
// ---------------------------------------------------------------------------

export async function reachable(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.status > 0 && res.status < 500
  } catch {
    return false
  }
}

export async function ensureServer(ctx, { start }) {
  const probe = studioUrl(ctx, '/auth/signin')
  if (await reachable(probe)) return { started: false, proc: null }
  if (!start) {
    throw new Error(
      `Studio is not reachable at ${ctx.base} and --start was not passed. ` +
        'Start the playground (e.g. `pnpm --filter playground dev`) and retry, or pass --start.',
    )
  }
  const proc = spawn('pnpm', ['--filter', 'playground', 'dev'], {
    env: { ...process.env, npm_config_verify_deps_before_run: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stdout.on('data', (c) => process.stdout.write(c))
  proc.stderr.on('data', (c) => process.stderr.write(c))
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    if (await reachable(probe)) return { started: true, proc }
    await new Promise((r) => setTimeout(r, 1500))
  }
  proc.kill('SIGTERM')
  throw new Error(`Timed out waiting for Studio at ${probe} after --start.`)
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function shortError(error) {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.split('\n')[0].slice(0, 200)
}

export function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function slugForKey(key) {
  return key
}
