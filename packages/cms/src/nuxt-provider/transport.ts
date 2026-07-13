import type { ContentProvider } from '@lupinum/ginko-content/provider'
import type { FunctionReference } from 'convex/server'

type ProviderEvent = Parameters<ContentProvider['query']>[0]
type ProviderRequestEvent = ProviderEvent | undefined
type PublicErrorData = Record<string, unknown>
type ProviderError = Error & {
  statusCode: number
  statusMessage: string
  data: PublicErrorData & { code: string }
}
type ConvexQueryCaller = {
  query: (reference: FunctionReference<'query'>, args: Record<string, unknown>) => Promise<unknown>
}
type ClientFactory = (url: string) => ConvexQueryCaller

let testClientFactory: ClientFactory | undefined

export const setClientFactoryForTests = (factory: ClientFactory | undefined) => {
  testClientFactory = factory
}

export const providerError = (
  code: string,
  message: string,
  statusCode = 400,
  details: PublicErrorData = {},
): ProviderError =>
  Object.assign(new Error(message), {
    statusCode,
    statusMessage: code,
    data: { code, ...details },
  })

const requiredEnv = (name: string): string => {
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

const functionReference = (name: string): FunctionReference<'query'> =>
  ({ [Symbol.for('functionName')]: name }) as unknown as FunctionReference<'query'>

const SECRET_PATTERN = /bearer\s+|mcp_|api[_-]?key|token|secret|password|cookie|authorization/i
const redactSecretString = (value: string): string =>
  SECRET_PATTERN.test(value)
    ? '[redacted]'
    : value.replace(/https?:\/\/[^/@\s]+@/gi, 'https://[redacted]@')

const allowedRemoteData = (value: unknown, depth = 0): unknown => {
  if (depth > 4 || value === null || value === undefined) return null
  if (typeof value === 'string') return redactSecretString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => allowedRemoteData(item, depth + 1))
  if (typeof value !== 'object') return null
  const allowedKeys = new Set([
    'code',
    'field',
    'path',
    'collection',
    'locale',
    'entryId',
    'maxPages',
    'maxRecords',
    'operator',
    'direction',
    'statusCode',
  ])
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => allowedKeys.has(key) && !SECRET_PATTERN.test(key))
      .map(([key, child]) => [key, allowedRemoteData(child, depth + 1)]),
  )
}

const normalizeRemoteError = (error: unknown, operation: string): ProviderError => {
  // `cause` is intentionally opaque. Only the normalized public error
  // contract may cross the provider boundary.
  const remote =
    error && typeof error === 'object'
      ? (error as {
          data?: unknown
          statusMessage?: unknown
          statusCode?: unknown
          message?: unknown
        })
      : {}
  const rawData = remote.data || {}
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
  const publicData = data && typeof data === 'object' ? (data as PublicErrorData) : {}
  const code =
    (typeof remote.statusMessage === 'string' && remote.statusMessage) ||
    (typeof publicData.code === 'string' && publicData.code) ||
    'provider_query_failed'
  const publicCode = SECRET_PATTERN.test(code) ? 'provider_query_failed' : code
  const statusCode =
    (typeof remote.statusCode === 'number' && remote.statusCode) ||
    (typeof publicData.statusCode === 'number' && publicData.statusCode) ||
    (publicCode === 'missing_locale_route' ? 404 : 500)
  const details = allowedRemoteData(publicData)
  return providerError(publicCode, `CMS provider query failed: ${operation}`, statusCode, {
    ...(details && typeof details === 'object' ? details : {}),
    operation,
  })
}

const requestCallers = new WeakMap<object, Promise<ConvexQueryCaller>>()

const callerForEvent = async (event: ProviderEvent): Promise<ConvexQueryCaller> => {
  const existing = requestCallers.get(event)
  if (existing) return await existing
  const pending = import('better-convex-nuxt/server').then(
    ({ serverConvex }) => serverConvex(event, { auth: 'none' }) as ConvexQueryCaller,
  )
  requestCallers.set(event, pending)
  return await pending
}

const callConvexFunction = async (
  event: ProviderRequestEvent,
  functionName: string,
  operation: string,
  args: Record<string, unknown>,
): Promise<unknown> => {
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

export const callGinko = async (
  event: ProviderRequestEvent,
  operation: string,
  args: Record<string, unknown>,
): Promise<unknown> =>
  await callConvexFunction(event, `ginkoCms/public:${operation}`, operation, args)
