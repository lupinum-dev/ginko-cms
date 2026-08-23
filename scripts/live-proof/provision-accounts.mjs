import { describeSanitizedAuthFailure } from './auth-failure.mjs'

const baseUrl = required('CMS_STORY_BASE_URL').replace(/\/$/, '')
const fixturePrefix = required('GINKO_CMS_FIXTURE_PREFIX').toLowerCase()

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

async function authRequest(path, body) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify(body),
      redirect: 'manual',
    })
    if (response.status !== 429 || attempt === 4) return response
    await response.arrayBuffer()
    await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt))
  }
  throw new Error('Unreachable account provisioning retry state.')
}

for (const role of ['viewer', 'editor', 'publisher', 'owner']) {
  const prefix = `GINKO_CMS_TEST_${role.toUpperCase()}`
  const email = required(`${prefix}_EMAIL`).toLowerCase()
  const password = required(`${prefix}_PASSWORD`)
  if (!email.includes(fixturePrefix)) {
    throw new Error(`${prefix}_EMAIL is outside the disposable fixture namespace.`)
  }
  const signUp = await authRequest('/api/auth/sign-up/email', {
    name: `${fixturePrefix} ${role}`,
    email,
    password,
  })
  if (!signUp.ok) {
    const signUpFailure = await describeSanitizedAuthFailure(signUp, [email, password])
    const signIn = await authRequest('/api/auth/sign-in/email', { email, password })
    if (!signIn.ok) {
      const signInFailure = await describeSanitizedAuthFailure(signIn, [email, password])
      throw new Error(
        `Disposable ${role} account provisioning failed (sign-up ${signUp.status} ${signUpFailure}; sign-in ${signIn.status} ${signInFailure}).`,
      )
    }
  }
}

console.log('Disposable Better Auth accounts are ready: 4 roles.')
