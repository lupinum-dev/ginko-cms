const baseUrl = required('CMS_STORY_BASE_URL').replace(/\/$/, '')
const fixturePrefix = required('GINKO_CMS_FIXTURE_PREFIX').toLowerCase()

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

async function authRequest(path, body) {
  return await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
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
    const signIn = await authRequest('/api/auth/sign-in/email', { email, password })
    if (!signIn.ok) {
      throw new Error(
        `Disposable ${role} account provisioning failed (${signUp.status}/${signIn.status}).`,
      )
    }
  }
}

console.log('Disposable Better Auth accounts are ready: 4 roles.')
