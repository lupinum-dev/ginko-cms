import { expectText, waitForStudioInteractive } from './browser-auth.mjs'
import { liveProofRichBodyMarker } from './public-api.mjs'

export async function runStudioJourneys({
  story,
  page,
  baseUrl,
  collection,
  collectionLabel,
  fixtureTitle,
  fixtureToken,
  certification,
  fixtureManifest,
  performanceSamples,
  uploadFixturePath,
  uploadFilename,
  redact,
  runSiteData,
  signIn,
}) {
  let fixtureEntryUrl = null
  await story(
    'content.fixture-publish',
    'Creates and publishes an isolated smoke entry',
    async () => {
      await page.goto(`${baseUrl}/studio/content/${collection}/new`, {
        waitUntil: 'domcontentloaded',
      })
      await waitForStudioInteractive(page)
      await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor({ timeout: 30000 })
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill(fixtureTitle)
      await page
        .getByRole('textbox', { name: 'Description' })
        .fill('Automated V-next release-candidate verification entry.')
      const createDraftButtons = page.getByRole('button', { name: 'Create draft' })
      if ((await createDraftButtons.count()) < 1) throw new Error('Create draft action is missing')
      await createDraftButtons.first().click()
      await page.waitForURL(
        new RegExp(`/studio/content/${collection}/(?!new(?:[/?#]|$))[^/?#]+$`),
        { timeout: 30000 },
      )
      fixtureEntryUrl = page.url()
      await page
        .locator('.studio-entry-topbar__save-indicator[data-save-state="saved"]')
        .waitFor({ timeout: 30000 })
      let persistedRelation = null
      let persistedRichBody = null
      if (certification) {
        const relationProbe = fixtureManifest.probes.relationEntry
        const relation = page.locator('#relatedDoc')
        await relation.waitFor({ timeout: 30000 })
        await relation.click()
        const relationSearch = page.getByPlaceholder('Search entries')
        await relationSearch.waitFor({ timeout: 30000 })
        await relationSearch.fill(relationProbe.title)
        const relationOption = page
          .getByRole('button')
          .filter({ hasText: relationProbe.title })
          .last()
        await relationOption.waitFor({ timeout: 30000 })
        await relationOption.click()

        const richBodyMarker = liveProofRichBodyMarker(fixtureToken)
        const richBodySource = `## ${richBodyMarker}\n\nThis **rich body** survives autosave, reopening, and publication.\n`
        await page.getByRole('button', { name: 'Markdown', exact: true }).click()
        const markdownSource = page.getByRole('textbox', { name: 'Content Markdown source' })
        await markdownSource.waitFor({ timeout: 30000 })
        await markdownSource.fill(richBodySource)
        await page.getByRole('button', { name: 'Visual', exact: true }).click()
        await page.getByRole('heading', { level: 2, name: richBodyMarker }).waitFor({
          timeout: 30000,
        })
        await page
          .locator('.studio-entry-topbar__save-indicator[data-save-state="saved"]')
          .waitFor({ timeout: 30000 })

        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByText(fixtureTitle, { exact: true }).first().waitFor({ timeout: 30000 })
        const reopenedRelation = page.locator('#relatedDoc')
        await reopenedRelation.waitFor({ timeout: 30000 })
        if (!(await reopenedRelation.textContent())?.includes(relationProbe.title)) {
          throw new Error('Reopened smoke entry did not preserve its relation.')
        }
        await page.getByRole('button', { name: 'Markdown', exact: true }).click()
        const reopenedSource = page.getByRole('textbox', { name: 'Content Markdown source' })
        await reopenedSource.waitFor({ timeout: 30000 })
        if ((await reopenedSource.inputValue()) !== richBodySource) {
          throw new Error('Reopened smoke entry did not preserve its rich body.')
        }
        await page.getByRole('button', { name: 'Visual', exact: true }).click()
        await page.getByRole('heading', { level: 2, name: richBodyMarker }).waitFor({
          timeout: 30000,
        })
        persistedRelation = relationProbe.stableId
        persistedRichBody = richBodyMarker
      }
      await page.getByRole('button', { name: 'Preview website changes' }).click()
      await page.getByRole('heading', { name: 'What will change on the website' }).waitFor({
        timeout: 30000,
      })
      await page.getByRole('button', { name: 'Publish EN' }).click()
      const publishDialog = page.getByRole('dialog', { name: 'Publish (EN)?' })
      await publishDialog.waitFor({ timeout: 30000 })
      await publishDialog.getByRole('button', { name: 'Publish (EN)', exact: true }).click()
      await page
        .locator('.studio-entry-topbar')
        .getByText('Live', { exact: true })
        .waitFor({ timeout: 30000 })
      return {
        url: fixtureEntryUrl,
        title: fixtureTitle,
        persistedRelation,
        persistedRichBody,
      }
    },
  )

  for (const [id, route, expected] of [
    ['studio-home', '/studio/', 'Ginko CMS Studio'],
    ['studio-blog', `/studio/content/${collection}`, collectionLabel],
    ['studio-assets', '/studio/assets', 'Media'],
    ['studio-model', '/studio/model', 'Content setup'],
    ['studio-activity', '/studio/activity', 'Activity log'],
    ['studio-agents', '/studio/agents', 'AI work sessions'],
    ['studio-reviews', '/studio/reviews', 'Approvals'],
    ['studio-site-data', '/studio/site-data', 'Site-wide content'],
    ['studio-settings', '/studio/settings', 'Settings'],
  ]) {
    await story(`nav.${id}`, `Studio deep link loads ${route}`, async () => {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
      await expectText(page, expected, 60000)
      return { url: page.url(), expected }
    })
  }

  await story(
    'content-model.contract-readonly',
    'Content model shows code-defined read-only collection contracts',
    async () => {
      await page.goto(`${baseUrl}/studio/model`, { waitUntil: 'domcontentloaded' })
      await waitForStudioInteractive(page)
      await expectText(page, 'Content setup', 60000)
      // The page header is part of the static shell; the installed-contract
      // collection list arrives through Convex and selects its first item
      // asynchronously. Wait for the selected collection's detail section so
      // this assertion measures the resolved model rather than its skeleton.
      await expectText(page, 'Content type details', 60000)
      const bodyText = await page.locator('body').textContent({ timeout: 30000 })
      for (const expected of ['Managed by developers', 'Content type details', 'fields']) {
        if (!bodyText.includes(expected)) throw new Error(`content model did not show ${expected}`)
      }
      for (const forbidden of ['Create collection', 'Add field', 'Save schema']) {
        if (bodyText.includes(forbidden)) {
          throw new Error(`content model exposed schema mutation control: ${forbidden}`)
        }
      }
      return { readonly: true }
    },
  )

  if (certification) {
    await story(
      'contract.deliberate-mismatch-readonly',
      'Contract mismatch remains diagnosable but blocks Studio writes',
      async () => {
        const mismatchUrl = new URL(fixtureManifest.probes.contractMismatchUrl)
        const mismatchPage = await page.context().newPage()
        try {
          await mismatchPage.goto(`${mismatchUrl.origin}/studio/model`, {
            waitUntil: 'domcontentloaded',
          })
          if (new URL(mismatchPage.url()).pathname === '/studio/auth/signin') {
            await signIn(mismatchPage, '/studio/model', undefined, mismatchUrl.origin)
          }
          await mismatchPage.getByTestId('cms-studio-ready').waitFor({ timeout: 30000 })
          await mismatchPage.getByTestId('cms-contract-write-blocked').waitFor({ timeout: 30000 })
          await expectText(mismatchPage, 'Content setup', 60000)
          const notice = await mismatchPage.getByTestId('cms-contract-write-blocked').textContent()
          if (!/content|presentation|hash|contract/i.test(notice ?? '')) {
            throw new Error('contract mismatch notice omitted mismatch diagnostics')
          }
          await mismatchPage.goto(
            `${mismatchUrl.origin}/studio/content/${fixtureManifest.probes.deepSearch.collection}/new`,
            { waitUntil: 'domcontentloaded' },
          )
          await mismatchPage.getByTestId('cms-contract-write-blocked').waitFor({ timeout: 30000 })
          const createDraft = mismatchPage.getByRole('button', { name: 'Create draft' }).first()
          if ((await createDraft.count()) > 0 && !(await createDraft.isDisabled())) {
            throw new Error('contract mismatch left draft creation enabled')
          }
          return { readsAllowed: true, writesBlocked: true, diagnosticsVisible: true }
        } finally {
          await mismatchPage.close()
        }
      },
    )
  }

  await runSiteData()

  await story(
    'nav.command-palette-assets',
    'Command palette opens and navigates to Media',
    async () => {
      await page.goto(`${baseUrl}/studio/`, { waitUntil: 'domcontentloaded' })
      await expectText(page, 'Ginko CMS Studio', 60000)
      await page
        .getByRole('button', { name: /Search|⌘\s*K/i })
        .first()
        .click()
      await page.getByPlaceholder('Search content or Studio pages').waitFor({ timeout: 30000 })
      const assetsSubtitle = page.getByText('Find and manage website assets')
      await assetsSubtitle.waitFor({ timeout: 30000 })
      await assetsSubtitle.evaluate((element) => {
        const option = element.closest('[role="option"]')
        if (!(option instanceof HTMLElement))
          throw new TypeError('Media command option was not found.')
        option.click()
      })
      await page.waitForURL(/\/studio\/assets$/, { timeout: 30000 })
      await expectText(page, 'Media')
      return { url: page.url() }
    },
  )

  await story(
    'content.entry-list-state',
    'Entry list shows content status and locale state',
    async () => {
      await page.goto(`${baseUrl}/studio/content/${collection}`, { waitUntil: 'domcontentloaded' })
      await expectText(page, collectionLabel, 60000)
      await page.getByPlaceholder('Search title, slug, or path').waitFor({ timeout: 30000 })
      const rows = page.getByTestId('cms-entry-row')
      await rows.filter({ hasText: fixtureTitle }).waitFor({ timeout: 30000 })
      const rowCount = await rows.count()
      if (rowCount < 1) throw new Error(`${collection} entry list rendered no rows`)
      const fixtureRow = rows.filter({ hasText: fixtureTitle })
      if ((await fixtureRow.count()) !== 1) throw new Error('published fixture row is missing')
      const rowText = await fixtureRow.textContent()
      if (!/Live|Draft only|Needs attention|Data-only|Archived/.test(rowText)) {
        throw new Error(`entry row did not expose public state: ${redact(rowText)}`)
      }
      if (!/[A-Z]{2}\s*·\s*(?:Live|Draft)/.test(rowText)) {
        throw new Error(`entry row did not expose locale readiness: ${redact(rowText)}`)
      }
      return { url: page.url(), rows: rowCount }
    },
  )

  await story(
    'content.entry-list-search-filter',
    'Entry list can filter entries by supported fields',
    async () => {
      await page.goto(`${baseUrl}/studio/content/${collection}`, { waitUntil: 'domcontentloaded' })
      await expectText(page, collectionLabel, 60000)
      const search = page.getByPlaceholder('Search title, slug, or path')
      await search.waitFor({ timeout: 30000 })
      const rows = page.getByTestId('cms-entry-row')
      await rows.filter({ hasText: fixtureTitle }).waitFor({ timeout: 30000 })
      const before = await rows.count()
      if (before < 1) throw new Error(`entry list had no rows for filter proof: ${before}`)
      const uniqueQuery = fixtureToken.split('-').at(-1)
      if (!uniqueQuery) throw new Error('entry filter proof has no unique query token')
      await search.fill(uniqueQuery)
      await page.waitForFunction(
        (expectedTitle) => {
          const renderedRows = document.querySelectorAll('[data-testid="cms-entry-row"]')
          return renderedRows.length === 1 && renderedRows[0]?.textContent?.includes(expectedTitle)
        },
        fixtureTitle,
        { timeout: 30000 },
      )
      const after = await rows.count()
      const filteredText = await rows.first().textContent()
      if (!filteredText.includes(fixtureTitle)) {
        throw new Error(`filtered row did not match expected content: ${redact(filteredText)}`)
      }
      return { before, after, query: uniqueQuery }
    },
  )

  if (certification) {
    await story(
      'scale.deep-search',
      'Server search finds a row beyond the first 1,000',
      async () => {
        const probe = fixtureManifest.probes.deepSearch
        await page.goto(`${baseUrl}/studio/content/${probe.collection}`, {
          waitUntil: 'domcontentloaded',
        })
        const search = page.getByPlaceholder('Search title, slug, or path')
        await search.waitFor({ timeout: 30000 })
        const startedAt = performance.now()
        await search.fill(probe.query)
        await page.getByTestId('cms-entry-row').filter({ hasText: probe.expectedTitle }).waitFor({
          timeout: 30000,
        })
        performanceSamples.search.push(performance.now() - startedAt)
        const titles = await page.getByTestId('cms-entry-row').allTextContents()
        if (!titles.some((title) => title.includes(probe.expectedTitle))) {
          throw new Error('deep server search did not return its terminal fixture')
        }
        return { query: probe.query, expectedTitle: probe.expectedTitle, rows: titles.length }
      },
    )

    await story(
      'scale.entry-pagination-1205',
      'Keyset pagination returns 1,205 rows without loss or duplication',
      async () => {
        const probe = fixtureManifest.probes.entryPagination
        await page.goto(`${baseUrl}/studio/content/${probe.collection}?work=${probe.workState}`, {
          waitUntil: 'domcontentloaded',
        })
        const rows = page.getByTestId('cms-entry-row')
        await rows.first().waitFor({ timeout: 30000 })
        let previousCount = await rows.count()
        while (previousCount < probe.expectedRows) {
          const loadMore = page.getByRole('button', { name: 'Load more', exact: true })
          if (!(await loadMore.isVisible().catch(() => false))) {
            throw new Error(`pagination stopped at ${previousCount} of ${probe.expectedRows}`)
          }
          const startedAt = performance.now()
          await loadMore.click()
          await page.waitForFunction(
            ({ selector, count }) => document.querySelectorAll(selector).length > count,
            { selector: '[data-testid="cms-entry-row"]', count: previousCount },
            { timeout: 30000 },
          )
          performanceSamples.listPaging.push(performance.now() - startedAt)
          previousCount = await rows.count()
          if (previousCount > probe.expectedRows) {
            throw new Error(
              `pagination returned ${previousCount}; expected exactly ${probe.expectedRows}`,
            )
          }
        }
        const slugs = await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-entry-slug')),
        )
        if (new Set(slugs).size !== slugs.length) {
          throw new Error('entry pagination returned duplicate stable rows')
        }
        await rows.filter({ hasText: probe.terminalTitle }).waitFor({ timeout: 30000 })
        if (
          await page
            .getByRole('button', { name: 'Load more', exact: true })
            .isVisible()
            .catch(() => false)
        ) {
          throw new Error('entry pagination claimed more rows after the exact fixture count')
        }
        return {
          workState: probe.workState,
          rows: previousCount,
          uniqueRows: new Set(slugs).size,
          pagingSamples: performanceSamples.listPaging.length,
        }
      },
    )
  }

  await story(
    'content.entry-editor-state',
    'Entry editor shows draft/publish workflow state',
    async () => {
      if (!fixtureEntryUrl) throw new Error('fixture entry URL is unavailable')
      await page.goto(fixtureEntryUrl, { waitUntil: 'domcontentloaded' })
      const titleField = page.getByRole('textbox', { name: 'Title', exact: true })
      await titleField.waitFor({ timeout: 30000 })
      const titleElement = await titleField.elementHandle()
      await page.waitForFunction(
        ({ element, expected }) =>
          (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
          element.value === expected,
        { element: titleElement, expected: fixtureTitle },
        { timeout: 30000 },
      )
      const hasPublish = await page
        .getByRole('button', { name: /publish/i })
        .first()
        .isVisible()
        .catch(() => false)
      const hasSaveDraft = await page
        .getByRole('button', { name: /save draft/i })
        .first()
        .isVisible()
        .catch(() => false)
      if (!hasPublish && !hasSaveDraft) {
        throw new Error('entry editor did not expose publish or save draft controls')
      }
      return { url: page.url(), hasPublish, hasSaveDraft }
    },
  )

  await story('assets.upload-and-trash', 'Uploads and retires a smoke image', async () => {
    await page.goto(`${baseUrl}/studio/assets`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Media' }).waitFor({ timeout: 30000 })
    const uploadInput = page.locator('input[type="file"][multiple]')
    await uploadInput.waitFor({ state: 'attached', timeout: 30000 })
    await uploadInput.setInputFiles(uploadFixturePath)
    const uploadInputElement = await uploadInput.elementHandle()
    await page.waitForFunction(
      (element) => element instanceof HTMLInputElement && element.value === '',
      uploadInputElement,
      { timeout: 30000 },
    )
    const sort = page.getByRole('combobox', { name: 'Sort' })
    await sort.click()
    await page.getByRole('option', { name: 'Date', exact: true }).click()
    // Uploading selects the new asset and opens its details sheet. Close the
    // sheet through its accessible control before targeting the now-inert
    // table by role.
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    const uploadedAssetRow = page.getByRole('row').filter({ hasText: uploadFilename })
    await uploadedAssetRow.waitFor({ timeout: 30000 })
    await uploadedAssetRow.getByRole('checkbox').check()
    const trashButton = page.getByRole('button', { name: 'Move to Trash' })
    await trashButton.waitFor({ timeout: 30000 })
    await trashButton.click()
    const trashDialog = page.getByRole('dialog', { name: 'Move selected assets to trash?' })
    await trashDialog.waitFor({ timeout: 30000 })
    await trashDialog.getByRole('button', { name: 'Move to trash' }).click()
    await uploadedAssetRow.waitFor({ state: 'hidden', timeout: 30000 })
    return { filename: uploadFilename, retired: true }
  })

  if (certification) {
    await story(
      'scale.asset-search-500',
      'Asset search reaches the 500-item fixture boundary',
      async () => {
        const probe = fixtureManifest.probes.assetSearch
        await page.goto(`${baseUrl}/studio/assets`, { waitUntil: 'domcontentloaded' })
        const search = page.getByPlaceholder('Search...', { exact: true })
        await search.waitFor({ timeout: 30000 })
        await search.fill(probe.query)
        await page.getByText(probe.expectedFilename, { exact: true }).waitFor({ timeout: 30000 })
        return {
          configuredAssets: fixtureManifest.targetScale.assets,
          query: probe.query,
          expectedFilename: probe.expectedFilename,
        }
      },
    )
  }
  return { fixtureEntryUrl }
}
