import { LIVE_PROOF_VIEWPORTS } from '../live-proof-config.mjs'
import {
  assertKeyboardNavigation,
  assertNoPageOverflow,
  auditAccessibility,
} from './browser-observability.mjs'

const viewportByRole = Object.freeze({
  viewer: LIVE_PROOF_VIEWPORTS.find(({ name }) => name === 'narrow'),
  editor: LIVE_PROOF_VIEWPORTS.find(({ name }) => name === 'tablet'),
  publisher: LIVE_PROOF_VIEWPORTS.find(({ name }) => name === 'desktop'),
})

export async function runRoleJourneys({
  story,
  createObservedContext,
  signIn,
  baseUrl,
  fixtureManifest,
  roles,
  captureScreenshot,
}) {
  for (const role of ['viewer', 'editor', 'publisher']) {
    await story(
      `authority.${role}`,
      `${role} sees exactly the permitted Studio actions`,
      async () => {
        const viewport = viewportByRole[role]
        if (!viewport) throw new Error(`Missing live-proof viewport for ${role}`)
        const roleContext = await createObservedContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: role === 'viewer' ? 'reduce' : 'no-preference',
        })
        const page = await roleContext.newPage()
        try {
          await signIn(
            page,
            `/studio/content/${fixtureManifest.probes.deepSearch.collection}`,
            roles[role],
          )
          await page.getByTestId('cms-studio-ready').waitFor({ timeout: 30000 })
          await page.getByPlaceholder('Search title, slug, or path').waitFor({ timeout: 60000 })

          // Capability assertions use DOM availability instead of viewport
          // visibility. At tablet and narrow widths the responsive sidebar can
          // legitimately hide an authorized link until its trigger is opened;
          // the dedicated responsive checks below prove that interaction path.
          const newContentLink = page.locator(
            `a[href$="/content/${fixtureManifest.probes.deepSearch.collection}/new"]`,
          )
          if (role !== 'viewer') {
            // The collection-scoped action is gated on the asynchronously
            // installed contract, so wait for that domain state rather than
            // sampling immediately after the page shell becomes ready.
            await newContentLink
              .first()
              .waitFor({ timeout: 30000 })
              .catch(() => null)
          }
          const newEntryAvailable = (await newContentLink.count()) > 0
          const mediaAvailable =
            (await page.locator('a[href="/assets"], a[href="/studio/assets"]').count()) > 0
          const approvalsAvailable =
            (await page.locator('a[href="/reviews"], a[href="/studio/reviews"]').count()) > 0

          if (role === 'viewer') {
            if (newEntryAvailable || mediaAvailable || approvalsAvailable) {
              throw new Error('viewer received a create, asset, or publish action')
            }
            const reducedMotion = await page.evaluate(
              () => matchMedia('(prefers-reduced-motion: reduce)').matches,
            )
            if (!reducedMotion)
              throw new Error('viewer quality context did not honor reduced motion')
          } else {
            if (!newEntryAvailable || !mediaAvailable) {
              throw new Error(
                `${role} did not receive draft and asset actions: ${JSON.stringify({ newEntryAvailable, mediaAvailable })}`,
              )
            }
            if (approvalsAvailable !== (role === 'publisher')) {
              throw new Error(`${role} publish-review navigation did not match its role`)
            }
          }

          for (const [route, heading] of [
            ['/studio/model', 'Content setup'],
            ['/studio/site-data', 'Site-wide content'],
            ['/studio/settings', 'Settings'],
          ]) {
            await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
            await page.getByRole('heading', { name: heading }).waitFor({ timeout: 30000 })
            const inspectionText = await page.locator('body').textContent()
            for (const forbidden of [
              'Create collection',
              'Add field',
              'Save schema',
              'New section',
              'Invite member',
              'Add refresh target',
              'MCP connections for AI tools',
            ]) {
              if (inspectionText?.includes(forbidden)) {
                throw new Error(`${role} read-only inspection exposed ${forbidden}`)
              }
            }
          }

          let approvedReview = false
          if (role === 'publisher') {
            const reviewProbe = fixtureManifest.probes.pendingReview
            await page.goto(`${baseUrl}/studio/reviews`, { waitUntil: 'domcontentloaded' })
            const review = page.locator('article').filter({ hasText: reviewProbe.title })
            await review.waitFor({ timeout: 30000 })
            const reviewText = await review.textContent()
            for (const locale of reviewProbe.localeCodes) {
              if (!new RegExp(`\\b${locale}\\b`, 'i').test(reviewText ?? '')) {
                throw new Error(`publish-all review omitted locale ${locale}`)
              }
            }
            await review.getByRole('button', { name: 'Approve and publish' }).click()
            const dialog = page.getByRole('dialog', { name: 'Approve and publish?' })
            await dialog.waitFor({ timeout: 30000 })
            await dialog.getByRole('button', { name: 'Approve and publish' }).click()
            await page
              .getByText(reviewProbe.title, { exact: true })
              .last()
              .waitFor({ timeout: 30000 })
            await page.getByText('Approved', { exact: true }).first().waitFor({ timeout: 30000 })
            for (const [locale, path] of Object.entries(reviewProbe.publicPaths)) {
              const response = await fetch(`${baseUrl}${path}`)
              const html = await response.text()
              if (!response.ok)
                throw new Error(`${locale} published path returned ${response.status}`)
              const alternateLocale = locale === 'en' ? 'de' : 'en'
              if (!new RegExp(`hreflang=["']${alternateLocale}["']`).test(html)) {
                throw new Error(`${locale} public page omitted ${alternateLocale} alternate`)
              }
            }
            approvedReview = true
          }

          await page.goto(`${baseUrl}${fixtureManifest.probes.roleEntry.path}`, {
            waitUntil: 'domcontentloaded',
          })
          const title = page.getByRole('textbox', { name: 'Title', exact: true })
          await title.waitFor({ timeout: 30000 })
          const titleDisabled = await title.isDisabled()
          const publishVisible = await page
            .getByRole('button', { name: /^Publish [A-Z]{2}$/ })
            .isVisible()
            .catch(() => false)
          if (role === 'viewer' && (!titleDisabled || publishVisible)) {
            throw new Error('viewer could edit or publish the role probe entry')
          }
          if (role === 'editor' && (titleDisabled || publishVisible)) {
            throw new Error('editor draft access or publish denial was incorrect')
          }
          if (role === 'publisher' && (titleDisabled || !publishVisible)) {
            throw new Error('publisher edit/publish access was incorrect')
          }

          // Exercise focus and the command palette before capturing the role
          // surface. This also proves the responsive shell has fully settled
          // after the preceding authenticated route changes.
          const focus = await assertKeyboardNavigation(page)
          const screenshot = await captureScreenshot(`authority.${role}`, page)
          return {
            role,
            viewport,
            newEntryAvailable,
            mediaAvailable,
            approvalsAvailable,
            titleDisabled,
            publishVisible,
            approvedReview,
            screenshot,
            accessibility: await auditAccessibility(page, `${role} ${viewport.name}`),
            overflow: await assertNoPageOverflow(page, `${role} ${viewport.name}`),
            focus,
          }
        } catch (error) {
          await captureScreenshot(`authority.${role}-failed`, page).catch(() => null)
          throw error
        } finally {
          await roleContext.close()
        }
      },
    )
  }
}
