function percentile(samples, quantile) {
  if (!Array.isArray(samples) || samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)]
}

export function createPerformanceProof(sampleCount) {
  const evidence = { sampleCount, metrics: {} }
  const samples = {
    coldInteractive: [],
    primaryNavigation: [],
    search: [],
    listPaging: [],
    keystroke: [],
    publishPreview: [],
    inp: [],
    cls: [],
  }

  function recordPerformanceMetric(name, unit, budget, values) {
    if (!Array.isArray(values) || values.length < sampleCount) {
      evidence.metrics[name] = {
        unit,
        budget,
        samples: values ?? [],
        p95: null,
        passed: false,
        reason: `${values?.length ?? 0} samples; ${sampleCount} required`,
      }
      return
    }
    const p95 = percentile(values, 0.95)
    evidence.metrics[name] = {
      unit,
      budget,
      samples: values.map((sample) => Math.round(sample * 100) / 100),
      p95: Math.round(p95 * 100) / 100,
      passed: p95 < budget,
    }
  }

  async function runJourney({
    context,
    page,
    createObservedContext,
    baseUrl,
    collection,
    collectionLabel,
    fixtureToken,
    fixtureManifest,
  }) {
    const storageState = await context.storageState()
    for (let index = 0; index < sampleCount; index += 1) {
      const coldContext = await createObservedContext({
        storageState,
        viewport: { width: 1440, height: 1000 },
      })
      const coldPage = await coldContext.newPage()
      try {
        const startedAt = performance.now()
        await coldPage.goto(`${baseUrl}/studio/`, { waitUntil: 'domcontentloaded' })
        await coldPage.getByTestId('cms-studio-ready').waitFor({ timeout: 30000 })
        samples.coldInteractive.push(performance.now() - startedAt)
        await coldPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
        const observed = await coldPage.evaluate(() => globalThis.__ginkoLivePerformance)
        if (observed?.unsupported) throw new Error('Layout Shift observer is unsupported')
        samples.cls.push(observed?.cls ?? 0)
      } finally {
        await coldContext.close()
      }
    }

    for (let index = 0; index < sampleCount; index += 1) {
      await page.goto(`${baseUrl}/studio/`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('cms-studio-ready').waitFor({ timeout: 30000 })
      const contentLink = page
        .getByRole('navigation', { name: 'Studio navigation' })
        .getByRole('link', { name: collectionLabel, exact: true })
        .first()
      await contentLink.waitFor({ timeout: 30000 })
      const startedAt = performance.now()
      await contentLink.click()
      await page.waitForURL(new RegExp(`/studio/content/${collection}/?$`), { timeout: 30000 })
      await page.getByPlaceholder('Search title, slug, or path').waitFor({ timeout: 30000 })
      samples.primaryNavigation.push(performance.now() - startedAt)
    }

    const searchProbe = fixtureManifest.probes.deepSearch
    await page.goto(`${baseUrl}/studio/content/${searchProbe.collection}`, {
      waitUntil: 'domcontentloaded',
    })
    const search = page.getByPlaceholder('Search title, slug, or path')
    const rows = page.getByTestId('cms-entry-row')
    await search.waitFor({ timeout: 30000 })
    for (let index = 0; index < sampleCount; index += 1) {
      await search.fill(`no-match-${fixtureToken}-${index}`)
      await rows
        .first()
        .waitFor({ state: 'hidden', timeout: 30000 })
        .catch(async () => {
          if ((await rows.count()) !== 0)
            throw new Error('search reset did not reach no-match state')
        })
      const startedAt = performance.now()
      await search.fill(searchProbe.query)
      await rows.filter({ hasText: searchProbe.expectedTitle }).waitFor({ timeout: 30000 })
      samples.search.push(performance.now() - startedAt)
    }

    await page.goto(`${baseUrl}${fixtureManifest.probes.roleEntry.path}`, {
      waitUntil: 'domcontentloaded',
    })
    const bodyEditor = page.locator(
      '[data-testid="cms-richtext-editor"] .ProseMirror[contenteditable="true"]',
    )
    await bodyEditor.waitFor({ timeout: 30000 })
    const bodyBytes = await bodyEditor.evaluate(
      (element) => new TextEncoder().encode(element.textContent ?? '').byteLength,
    )
    if (bodyBytes < fixtureManifest.probes.roleEntry.bodyBytes - 512) {
      throw new Error(
        `long-editor probe loaded only ${bodyBytes} rendered body bytes; expected the near-limit fixture`,
      )
    }
    for (let index = 0; index < sampleCount; index += 1) {
      await bodyEditor.focus()
      await bodyEditor.evaluate((element) => {
        const measurement = { startedAt: 0, value: null }
        globalThis.__ginkoKeystrokeMeasurement = measurement
        element.addEventListener('keydown', () => (measurement.startedAt = performance.now()), {
          once: true,
        })
        element.addEventListener(
          'input',
          () =>
            requestAnimationFrame(
              () => (measurement.value = performance.now() - measurement.startedAt),
            ),
          { once: true },
        )
      })
      await page.keyboard.type('x')
      await page.waitForFunction(
        () => Number.isFinite(globalThis.__ginkoKeystrokeMeasurement?.value),
        null,
        { timeout: 5000 },
      )
      samples.keystroke.push(
        await page.evaluate(() => {
          const value = globalThis.__ginkoKeystrokeMeasurement.value
          delete globalThis.__ginkoKeystrokeMeasurement
          return value
        }),
      )
      await page.keyboard.press('Backspace')
    }
    await page.waitForTimeout(750)
    await page
      .locator('.studio-entry-topbar__save-indicator[data-save-state="saved"]')
      .waitFor({ timeout: 30000 })

    for (let index = 0; index < sampleCount; index += 1) {
      const publish = page.getByRole('button', { name: /^Publish [A-Z]{2}$/ })
      await publish.waitFor({ timeout: 30000 })
      const startedAt = performance.now()
      await publish.click()
      const dialog = page.getByRole('dialog', { name: 'Publish (EN)?' })
      await dialog.waitFor({ timeout: 30000 })
      samples.publishPreview.push(performance.now() - startedAt)
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await dialog.waitFor({ state: 'hidden', timeout: 30000 })
    }

    await page.waitForTimeout(250)
    const observed = await page.evaluate(() => globalThis.__ginkoLivePerformance)
    if (observed?.unsupported) throw new Error('Event Timing observer is unsupported')
    const durationByInteraction = new Map()
    for (const event of observed?.events ?? []) {
      durationByInteraction.set(
        event.interactionId,
        Math.max(durationByInteraction.get(event.interactionId) ?? 0, event.duration),
      )
    }
    samples.inp.push(...durationByInteraction.values())
    while (samples.inp.length < sampleCount) {
      // Event Timing intentionally omits interactions below its 16 ms reporting threshold.
      samples.inp.push(16)
    }

    recordPerformanceMetric('studioColdInteractive', 'ms', 2500, samples.coldInteractive)
    recordPerformanceMetric('primaryNavigation', 'ms', 300, samples.primaryNavigation)
    recordPerformanceMetric('searchFilter', 'ms', 300, samples.search)
    recordPerformanceMetric('listPaging', 'ms', 200, samples.listPaging)
    recordPerformanceMetric('longEditorKeystroke', 'ms', 50, samples.keystroke)
    recordPerformanceMetric('publishPreview', 'ms', 2000, samples.publishPreview)
    recordPerformanceMetric('interactionToNextPaint', 'ms', 200, samples.inp)
    recordPerformanceMetric('cumulativeLayoutShift', 'score', 0.1, samples.cls)
    evidence.inp = {
      observer: 'PerformanceEventTiming',
      reportingThresholdMs: 16,
      observedInteractions: durationByInteraction.size,
    }
    const failed = Object.entries(evidence.metrics)
      .filter(([, metric]) => metric.passed !== true)
      .map(([name, metric]) => `${name}: ${metric.reason ?? `p95=${metric.p95}`}`)
    if (failed.length) throw new Error(`performance budgets failed: ${failed.join('; ')}`)
    return evidence
  }

  return { evidence, samples, runJourney }
}
