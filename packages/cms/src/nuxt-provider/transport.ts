import { createContentDataSourceError } from '@lupinum/ginko-content/data-source'
import type { ContentDataSourceControl } from '@lupinum/ginko-content/data-source'
import type { ContentProvider } from '@lupinum/ginko-content/provider'
import type { FunctionReference } from 'convex/server'

type ProviderEvent = Parameters<ContentProvider['query']>[0]
type PublicErrorData = Record<string, unknown>
export type ConvexQueryCaller = {
  query: (reference: FunctionReference<'query'>, args: Record<string, unknown>) => Promise<unknown>
}
type ClientFactory = (url: string) => ConvexQueryCaller

let testClientFactory: ClientFactory | undefined

export const setClientFactoryForTests = (factory: ClientFactory | undefined) => {
  testClientFactory = factory
}

export const providerError = (
  code: string,
  _message: string,
  _statusCode = 400,
  _details: PublicErrorData = {},
): Error =>
  createContentDataSourceError(
    ['CURSOR_INVALID', 'INVALID_CURSOR', 'QUERY_CURSOR_INVALID'].includes(code)
      ? 'QUERY_CURSOR_INVALID'
      : 'BACKEND_FAILURE',
  )

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

const normalizeRemoteError = (error: unknown, _operation: string): Error => {
  const remote =
    error && typeof error === 'object'
      ? (error as {
          data?: unknown
          statusMessage?: unknown
        })
      : {}
  const data =
    typeof remote.data === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(remote.data)
            return parsed && typeof parsed === 'object' ? parsed : {}
          } catch {
            return {}
          }
        })()
      : remote.data && typeof remote.data === 'object'
        ? remote.data
        : {}
  const code =
    (typeof remote.statusMessage === 'string' && remote.statusMessage) ||
    (typeof (data as PublicErrorData).code === 'string' &&
      ((data as PublicErrorData).code as string)) ||
    ''
  return createContentDataSourceError(
    ['CURSOR_INVALID', 'INVALID_CURSOR', 'QUERY_CURSOR_INVALID'].includes(code)
      ? 'QUERY_CURSOR_INVALID'
      : 'BACKEND_FAILURE',
  )
}

export const callerForEvent = async (event: ProviderEvent): Promise<ConvexQueryCaller> => {
  try {
    if (testClientFactory) {
      return testClientFactory(convexUrl())
    }
    const { serverConvex } = await import('better-convex-nuxt/server')
    return serverConvex(event, { auth: 'none' }) as ConvexQueryCaller
  } catch (error) {
    throw normalizeRemoteError(error, 'context')
  }
}

export const callGinko = async (
  caller: ConvexQueryCaller,
  operation: string,
  args: Record<string, unknown>,
  control: ContentDataSourceControl,
): Promise<unknown> => {
  try {
    assertControlActive(control)
    const result = await caller.query(functionReference(`ginkoCms/public:${operation}`), args)
    assertControlActive(control)
    return result
  } catch (error) {
    throw normalizeRemoteError(error, operation)
  }
}

function assertControlActive(control: ContentDataSourceControl): void {
  if (control.signal.aborted || Date.now() >= control.deadlineAt) {
    throw createContentDataSourceError('BACKEND_FAILURE')
  }
}
