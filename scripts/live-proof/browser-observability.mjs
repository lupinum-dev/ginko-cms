import axe from 'axe-core'

export function createBrowserObservability({
  redact,
  expectedHttpFailure,
  expectedRequestFailure = () => false,
}) {
  const evidence = {
    console: [],
    pageErrors: [],
    requestFailures: [],
    expectedRequestFailures: [],
    httpFailures: [],
    expectedConsoleFailures: [],
    expectedHttpFailures: [],
    screenshots: [],
  }

  function observePage(page) {
    page.on('console', (message) => {
      if (!['warning', 'error'].includes(message.type())) return
      const url = message.location().url || page.url()
      const status = Number(/status of (\d{3})/u.exec(message.text())?.[1])
      const failure = {
        type: message.type(),
        text: redact(message.text()),
        url: redact(url),
      }
      if (Number.isInteger(status) && expectedHttpFailure(url, status)) {
        evidence.expectedConsoleFailures.push(failure)
      } else {
        evidence.console.push(failure)
      }
    })
    page.on('pageerror', (error) => {
      evidence.pageErrors.push({
        message: redact(error.message),
        url: redact(page.url()),
      })
    })
    page.on('requestfailed', (request) => {
      const failure = {
        method: request.method(),
        url: redact(request.url()),
        error: redact(request.failure()?.errorText ?? 'request failed'),
      }
      if (expectedRequestFailure(request, request.failure()?.errorText ?? 'request failed')) {
        evidence.expectedRequestFailures.push(failure)
      } else {
        evidence.requestFailures.push(failure)
      }
    })
    page.on('response', (response) => {
      if (response.status() < 400) return
      const failure = {
        method: response.request().method(),
        status: response.status(),
        url: redact(response.url()),
      }
      if (expectedHttpFailure(response.url(), response.status())) {
        evidence.expectedHttpFailures.push(failure)
      } else {
        evidence.httpFailures.push(failure)
      }
    })
  }

  async function createObservedContext(browser, options = {}) {
    const context = await browser.newContext(options)
    await installPerformanceObservers(context)
    context.on('page', observePage)
    return context
  }

  return { evidence, observePage, createObservedContext }
}

export async function installPerformanceObservers(context) {
  await context.addInitScript(() => {
    globalThis.__ginkoLivePerformance = { cls: 0, events: [] }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) globalThis.__ginkoLivePerformance.cls += entry.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) {
            globalThis.__ginkoLivePerformance.events.push({
              duration: entry.duration,
              interactionId: entry.interactionId,
              name: entry.name,
            })
          }
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
    } catch {
      globalThis.__ginkoLivePerformance.unsupported = true
    }
  })
}

export async function assertNoPageOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  if (overflow.document > 1 || overflow.body > 1) {
    throw new Error(`${label} has page-level horizontal overflow: ${JSON.stringify(overflow)}`)
  }
  return overflow
}

export async function auditAccessibility(page, label) {
  await page.addScriptTag({ content: axe.source })
  const audit = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    })
    return result.violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact))
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
        targets: violation.nodes.slice(0, 5).map((node) => node.target),
      }))
  })
  if (audit.length) {
    throw new Error(`${label} has serious accessibility violations: ${JSON.stringify(audit)}`)
  }
  return { seriousOrCriticalViolations: 0 }
}

export async function assertKeyboardNavigation(page) {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  let focus = null
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await page.keyboard.press('Tab')
    focus = await page.evaluate((tabAttempt) => {
      const element = document.activeElement
      return {
        attempt: tabAttempt,
        tag: element?.tagName ?? null,
        role: element?.getAttribute?.('role') ?? null,
        tabIndex: element instanceof HTMLElement ? element.tabIndex : null,
      }
    }, attempt)
    if (focus.tag && focus.tag !== 'BODY' && focus.tabIndex !== -1) break
  }
  if (!focus?.tag || focus.tag === 'BODY' || focus.tabIndex === -1) {
    throw new Error(`Keyboard focus did not enter an interactive control: ${JSON.stringify(focus)}`)
  }
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  const palette = page.getByPlaceholder('Search content or Studio pages')
  await palette.waitFor({ timeout: 30000 })
  await page.keyboard.press('Escape')
  await palette.waitFor({ state: 'hidden', timeout: 30000 })
  return focus
}
