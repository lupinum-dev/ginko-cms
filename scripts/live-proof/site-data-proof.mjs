function publicSiteData(body) {
  const result = body?.result ?? body?.data ?? body
  if (result && typeof result === 'object' && 'key' in result && 'data' in result) {
    return result.data
  }
  return result ?? null
}

export async function runSiteDataProof({
  story,
  page,
  baseUrl,
  certification,
  fixtureToken,
  fetchJson,
  redact,
}) {
  if (!certification) {
    await story('site-data.view', 'Permitted user can view site data', async () => {
      await page.goto(`${baseUrl}/studio/site-data`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'Site-wide content' }).waitFor({ timeout: 60000 })
      const bodyText = await page.locator('body').textContent({ timeout: 30000 })
      if (!bodyText.includes('No site-wide sections') && !bodyText.includes('New section')) {
        throw new Error('site-wide content page did not show its list or empty state')
      }
      return { url: page.url() }
    })
    return
  }

  await story(
    'site-data.localized-public-lifecycle',
    'Localized site data becomes public, updates, becomes private, and deletes cleanly',
    async () => {
      const key = `proof-${fixtureToken}`.slice(0, 110)
      const label = `Proof site data ${fixtureToken}`.slice(0, 110)
      const values = {
        en: `English ${fixtureToken}`,
        de: `Deutsch ${fixtureToken}`,
        deUpdated: `Deutsch updated ${fixtureToken}`,
      }
      const readPublic = async (locale) => {
        const { response, body, text } = await fetchJson(
          `/api/_content/site-data?key=${encodeURIComponent(key)}&locale=${encodeURIComponent(locale)}`,
        )
        if (!response.ok) {
          throw new Error(`site data ${locale} read failed ${response.status}: ${redact(text)}`)
        }
        return publicSiteData(body)
      }
      const waitForPublic = async (locale, expected) => {
        const deadline = Date.now() + 30000
        let actual = null
        do {
          actual = await readPublic(locale)
          if (JSON.stringify(actual) === JSON.stringify(expected)) return actual
          await new Promise((resolve) => setTimeout(resolve, 250))
        } while (Date.now() < deadline)
        throw new Error(
          `site data ${locale} did not reach ${redact(JSON.stringify(expected))}; received ${redact(JSON.stringify(actual))}`,
        )
      }

      await page.goto(`${baseUrl}/studio/site-data`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'Site-wide content' }).waitFor({ timeout: 60000 })
      await page
        .getByRole('button', { name: /New section|Create section/ })
        .first()
        .click()
      await page.locator('#new-key').fill(key)
      await page.locator('#new-label').fill(label)
      const localized = page
        .getByText('Localized', { exact: true })
        .locator('xpath=ancestor::label[1]')
        .getByRole('switch')
      await localized.click()
      await page.getByRole('button', { name: 'Create', exact: true }).click()
      const blockToggle = page
        .getByText(label, { exact: true })
        .locator('xpath=ancestor::button[1]')
      await blockToggle.waitFor({ timeout: 30000 })
      await blockToggle.click()

      const editor = page.locator(`#site-data-block-${key}`)
      const json = editor.locator('#site-data-custom-json')
      const save = editor.getByRole('button', { name: 'Save', exact: true })
      const saveEditor = async () => {
        await save.click()
        await page.waitForTimeout(50)
        const element = await save.elementHandle()
        await page.waitForFunction((button) => !button.disabled, element, { timeout: 30000 })
      }
      await json.waitFor({ timeout: 30000 })
      await json.fill(JSON.stringify({ message: values.en }))
      await saveEditor()

      const localePicker = page.getByRole('group', { name: 'Language' })
      await localePicker.getByRole('button', { name: 'de', exact: true }).click()
      await page.waitForFunction(
        ({ selector, previous }) => !document.querySelector(selector)?.value.includes(previous),
        { selector: '#site-data-custom-json', previous: values.en },
        { timeout: 30000 },
      )
      await json.fill(JSON.stringify({ message: values.de }))
      await saveEditor()
      await waitForPublic('en', null)
      await waitForPublic('de', null)

      const blockHeader = blockToggle.locator('xpath=ancestor::div[contains(@class,"grid")][1]')
      await blockHeader.getByRole('button', { name: 'Make public', exact: true }).click()
      const publicDialog = page.getByRole('dialog', { name: 'Show section on website?' })
      await publicDialog.waitFor({ timeout: 30000 })
      await publicDialog.getByRole('button', { name: 'Make public' }).click()
      await waitForPublic('en', { message: values.en })
      await waitForPublic('de', { message: values.de })

      await json.fill(JSON.stringify({ message: values.deUpdated }))
      await saveEditor()
      await waitForPublic('de', { message: values.deUpdated })

      await blockHeader.getByRole('button', { name: 'Make private', exact: true }).click()
      const privateDialog = page.getByRole('dialog', { name: 'Hide section from website?' })
      await privateDialog.waitFor({ timeout: 30000 })
      await privateDialog.getByRole('button', { name: 'Make private' }).click()
      await waitForPublic('en', null)
      await waitForPublic('de', null)

      await blockHeader.locator('button').last().click()
      const deleteDialog = page.getByRole('dialog', { name: 'Delete site-wide section?' })
      await deleteDialog.waitFor({ timeout: 30000 })
      await deleteDialog.getByRole('button', { name: 'Delete section' }).click()
      await page.getByText(label, { exact: true }).waitFor({ state: 'hidden', timeout: 30000 })
      await waitForPublic('en', null)
      return { key, localized: true, publicTransitions: 4, deleted: true }
    },
  )
}
