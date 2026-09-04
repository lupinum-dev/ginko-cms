export async function signIn(page, redirect, credentials, origin) {
  await page.goto(`${origin}/studio/auth/signin?redirect=${encodeURIComponent(redirect)}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
    timeout: 30000,
  })
  await page.getByTestId('cms-auth-email').fill(credentials.email)
  await page.getByTestId('cms-auth-password').fill(credentials.password)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/auth/sign-in/email'),
      { timeout: 30000 },
    )
    await page.getByTestId('cms-auth-submit').click()
    const response = await responsePromise
    if (response.ok()) break
    if (response.status() !== 429 || attempt === 4) {
      throw new Error(`sign-in failed with ${response.status()}`)
    }
    const retryAfter = Number(response.headers()['retry-after'])
    const delay = Number.isFinite(retryAfter)
      ? Math.min(30_000, Math.max(1_000, retryAfter * 1_000))
      : 1_000 * 2 ** attempt
    await page.waitForTimeout(delay)
  }
  await page.waitForFunction((expectedPath) => location.pathname === expectedPath, redirect, {
    timeout: 30000,
  })
}

export async function expectText(page, text, timeout = 30000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout })
}

export async function waitForStudioInteractive(page, timeout = 30000) {
  await page.locator('[data-testid="cms-studio-ready"][data-hydrated="true"]').waitFor({ timeout })
}
