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

          const newEntryVisible = await page
            .getByRole('link', { name: 'New entry', exact: true })
            .first()
            .isVisible()
            .catch(() => false)
          const mediaVisible = await page
            .getByRole('link', { name: /Media/ })
            .first()
            .isVisible()
            .catch(() => false)
          const approvalsVisible = await page
            .getByRole('link', { name: /Approvals/ })
            .first()
            .isVisible()
            .catch(() => false)
          const settingsVisible = await page
            .getByRole('link', { name: /Settings/ })
            .first()
            .isVisible()
            .catch(() => false)

          if (role === 'viewer') {
            if (newEntryVisible || mediaVisible || approvalsVisible || settingsVisible) {
              throw new Error('viewer received a create, asset, publish, or settings action')
            }
            const reducedMotion = await page.evaluate(
              () => matchMedia('(prefers-reduced-motion: reduce)').matches,
            )
            if (!reducedMotion)
              throw new Error('viewer quality context did not honor reduced motion')
          } else {
            if (!newEntryVisible || !mediaVisible) {
              throw new Error(`${role} did not receive draft and asset actions`)
            }
            if (approvalsVisible !== (role === 'publisher')) {
              throw new Error(`${role} publish-review navigation did not match its role`)
            }
            if (settingsVisible) throw new Error(`${role} received owner-only settings access`)
          }

          for (const [route, heading] of [
            ['/studio/model', 'Content setup'],
            ['/studio/site-data', 'Site-wide content'],
          ]) {
            await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
            await page.getByRole('heading', { name: heading }).waitFor({ timeout: 30000 })
            const inspectionText = await page.locator('body').textContent()
            for (const forbidden of [
              'Create collection',
              'Add field',
              'Save schema',
              'New section',
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

          const screenshot = await captureScreenshot(`authority.${role}`, page)
          return {
            role,
            viewport,
            newEntryVisible,
            mediaVisible,
            approvalsVisible,
            settingsVisible,
            titleDisabled,
            publishVisible,
            approvedReview,
            screenshot,
            accessibility: await auditAccessibility(page, `${role} ${viewport.name}`),
            overflow: await assertNoPageOverflow(page, `${role} ${viewport.name}`),
            focus: await assertKeyboardNavigation(page),
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
