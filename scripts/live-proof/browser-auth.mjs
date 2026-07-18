export async function signIn(page, redirect, credentials, origin) {
  await page.goto(`${origin}/studio/auth/signin?redirect=${encodeURIComponent(redirect)}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
    timeout: 30000,
  })
  await page.getByTestId('cms-auth-email').fill(credentials.email)
  await page.getByTestId('cms-auth-password').fill(credentials.password)
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/sign-in/email'),
    { timeout: 30000 },
  )
  await page.getByTestId('cms-auth-submit').click()
  const response = await responsePromise
  if (!response.ok()) throw new Error(`sign-in failed with ${response.status()}`)
  await page.waitForFunction((expectedPath) => location.pathname === expectedPath, redirect, {
    timeout: 30000,
  })
}

export async function expectText(page, text, timeout = 30000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout })
}
