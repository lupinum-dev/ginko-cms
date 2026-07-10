let testClientFactory

export const setClientFactoryForTests = (factory) => {
  testClientFactory = factory
}

export const providerError = (code, message, statusCode = 400, details = {}) => {
  const error = new Error(message)
  error.statusCode = statusCode
  error.statusMessage = code
  error.data = { code, ...details }
  return error
}

const requiredEnv = (name) => {
  const value = process.env[name]
  if (value) return value
  throw providerError(
    'provider_config_missing',
    `${name} is required for the CMS content provider.`,
    500,
    { env: name },
  )
}

const convexUrl = () =>
  process.env.NUXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  requiredEnv('NUXT_PUBLIC_CONVEX_URL')

const functionReference = (name) => ({ [Symbol.for('functionName')]: name })

const normalizeRemoteError = (error, operation) => {
  // `cause` is intentionally opaque. Only the normalized public error
  // contract may cross the provider boundary.
  const rawData = error?.data || {}
  const data =
    typeof rawData === 'string'
      ? (() => {
          try {
            return JSON.parse(rawData)
          } catch {
            return { message: rawData }
          }
        })()
      : rawData
  const code = error?.statusMessage || data.code || 'provider_query_failed'
  const statusCode =
    error?.statusCode || data.statusCode || (code === 'missing_locale_route' ? 404 : 500)
  return providerError(
    code,
    error instanceof Error ? error.message : `CMS provider query failed: ${operation}`,
    statusCode,
    { operation, ...data },
  )
}

const requestCallers = new WeakMap()

const callerForEvent = async (event) => {
  if (!event || (typeof event !== 'object' && typeof event !== 'function')) return null
  const existing = requestCallers.get(event)
  if (existing) return await existing
  const pending = import('better-convex-nuxt/server').then(({ serverConvex }) =>
    serverConvex(event, { auth: 'none' }),
  )
  requestCallers.set(event, pending)
  return await pending
}

const callConvexFunction = async (event, functionName, operation, args) => {
  // Validate the site configuration before multi-site routing is introduced.
  process.env.GINKO_CONTENT_PROVIDER_SITE || 'default'
  try {
    if (testClientFactory) {
      return await testClientFactory(convexUrl()).query(functionReference(functionName), args)
    }
    if (event) {
      const caller = await callerForEvent(event)
      return await caller.query(functionReference(functionName), args)
    }
    const { ConvexHttpClient } = await import('convex/browser')
    return await new ConvexHttpClient(convexUrl()).query(functionReference(functionName), args)
  } catch (error) {
    throw normalizeRemoteError(error, operation)
  }
}

export const callGinko = async (event, operation, args) =>
  await callConvexFunction(event, `ginkoCms/public:${operation}`, operation, args)

export const callGinkoAsset = async (event, operation, args) =>
  await callConvexFunction(event, `ginkoCms/assets:${operation}`, `assets:${operation}`, args)
