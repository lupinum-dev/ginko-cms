// `ui-audit capture` — sign in, discover a content collection/entry, then
// screenshot every Studio route across the viewport x color-mode matrix.

import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { chromium } from 'playwright'

import {
  DETERMINISM_CSS,
  DETERMINISM_NOTES,
  MODES,
  STATIC_ROUTES,
  VIEWPORTS,
  discoverContentTargets,
  ensureServer,
  gotoAndSettle,
  requireCredentials,
  shortError,
  signIn,
  studioUrl,
} from './shared.mjs'

/**
 * @param {{outDir:string, base:string, studio:string, start:boolean}} opts
 */
export async function runCapture(opts) {
  const outDir = resolve(opts.outDir)
  const ctx = { base: opts.base, studio: opts.studio }
  const credentials = requireCredentials()

  await mkdir(outDir, { recursive: true })

  const server = await ensureServer(ctx, { start: opts.start })

  const browser = await chromium.launch()
  const shots = []
  let discovered = { collection: null, entryId: null, source: null, reason: null }

  try {
    // 1) Sign in once and reuse the authenticated storage state for every
    //    viewport/mode context.
    const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const authPage = await authContext.newPage()
    const ok = await signIn(authPage, ctx, credentials)
    if (!ok) throw new Error('Sign-in failed with the configured CMS_SMOKE credentials.')

    // 2) Discover the content collection + entry to resolve dynamic routes.
    discovered = await discoverContentTargets(authPage, ctx)

    const storageState = await authContext.storageState()
    await authContext.close()

    // 3) Resolve the full route list (static + discovered dynamic routes).
    const routes = resolveRoutes(discovered)

    // 4) Matrix: for each (viewport, mode) build a fresh context that boots in
    //    the right color mode, then walk every route.
    for (const viewport of VIEWPORTS) {
      for (const mode of MODES) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState,
          colorScheme: mode === 'dark' ? 'dark' : 'light',
          deviceScaleFactor: 1,
        })
        // Seed color-mode preference before any app script runs so both the
        // host (@nuxtjs/color-mode, key "nuxt-color-mode") and the SPA
        // (useColorMode, key "ginko-cms-studio-color-mode") boot correctly.
        await context.addInitScript((m) => {
          try {
            localStorage.setItem('nuxt-color-mode', m)
            localStorage.setItem('ginko-cms-studio-color-mode', m)
          } catch {
            /* storage may be unavailable pre-navigation */
          }
        }, mode)

        const page = await context.newPage()

        for (const route of routes) {
          const record = {
            route: route.key,
            url: studioUrl(ctx, route.path),
            viewport: viewport.name,
            mode,
            file: `${route.key}--${viewport.name}--${mode}.png`,
            skipped: false,
            reason: null,
            timestamp: null,
          }

          if (route.skip) {
            record.skipped = true
            record.reason = route.skipReason
            shots.push(record)
            continue
          }

          try {
            const settle = await gotoAndSettle(page, ctx, route.path)
            if (!settle.ok) {
              record.skipped = true
              record.reason = settle.reason
              shots.push(record)
              continue
            }
            record.url = settle.url
            await applyDeterminism(page, mode)
            await page.screenshot({
              path: join(outDir, record.file),
              fullPage: true,
              animations: 'disabled',
            })
            record.timestamp = new Date().toISOString()
          } catch (error) {
            record.skipped = true
            record.reason = `capture error: ${shortError(error)}`
          }
          shots.push(record)
        }

        await context.close()
      }
    }
  } finally {
    await browser.close()
    if (server.started && server.proc) server.proc.kill('SIGTERM')
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    base: ctx.base,
    studio: ctx.studio,
    discovered: {
      collection: discovered.collection,
      entryId: discovered.entryId,
      source: discovered.source,
      reason: discovered.reason,
    },
    viewports: VIEWPORTS,
    modes: MODES,
    notes: DETERMINISM_NOTES,
    counts: summarize(shots),
    shots,
  }
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const c = manifest.counts
  console.log(
    `capture complete: ${c.captured} captured, ${c.skipped} skipped (of ${c.total}). ` +
      `collection=${discovered.collection ?? 'none'} entry=${discovered.entryId ?? 'none'}`,
  )
  console.log(`manifest: ${join(outDir, 'manifest.json')}`)
  if (c.skipped > 0) {
    for (const s of shots.filter((x) => x.skipped)) {
      console.log(`  skipped ${s.file}: ${s.reason}`)
    }
  }
}

function resolveRoutes(discovered) {
  const routes = STATIC_ROUTES.map((r) => ({ ...r, skip: false, skipReason: null }))
  const { collection, entryId } = discovered

  if (collection) {
    routes.push({
      key: 'content-list',
      path: `/content/${collection}`,
      skip: false,
      skipReason: null,
    })
    routes.push({
      key: 'content-new',
      path: `/content/${collection}/new`,
      skip: false,
      skipReason: null,
    })
  } else {
    const reason = discovered.reason ?? 'no collection discovered'
    routes.push({ key: 'content-list', path: '', skip: true, skipReason: reason })
    routes.push({ key: 'content-new', path: '', skip: true, skipReason: reason })
  }

  if (collection && entryId) {
    routes.push({
      key: 'content-edit',
      path: `/content/${collection}/${entryId}`,
      skip: false,
      skipReason: null,
    })
  } else {
    routes.push({
      key: 'content-edit',
      path: '',
      skip: true,
      skipReason: discovered.reason ?? 'no entry id discovered (set CMS_AUDIT_ENTRY_ID)',
    })
  }

  return routes
}

async function applyDeterminism(page, mode) {
  await page.addStyleTag({ content: DETERMINISM_CSS }).catch(() => {})
  // Force the color-mode class on <html> right before the shot so token blocks
  // (.dark .ginko-cms) resolve regardless of host/SPA timing.
  await page
    .evaluate((m) => {
      const el = document.documentElement
      el.classList.toggle('dark', m === 'dark')
      el.classList.toggle('light', m === 'light')
    }, mode)
    .catch(() => {})
  // Settle one more frame after class flip.
  await page.waitForTimeout(150)
}

function summarize(shots) {
  const captured = shots.filter((s) => !s.skipped).length
  const skipped = shots.filter((s) => s.skipped).length
  return { total: shots.length, captured, skipped }
}
