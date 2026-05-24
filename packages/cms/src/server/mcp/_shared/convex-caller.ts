import { ConvexHttpClient } from 'convex/browser'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  UserIdentityAttributes,
} from 'convex/server'
import type { H3Event } from 'h3'
import { useEvent, useRuntimeConfig } from 'nitropack/runtime'

type AdminConvexHttpClient = ConvexHttpClient & {
  setAdminAuth: (token: string, actingAsIdentity?: unknown) => void
}

type AdminClientConfig = {
  event: H3Event
  convexUrl: string
  deployKey: string
}

const adminClientCache = new Map<string, AdminConvexHttpClient>()

type AnyQueryRef = FunctionReference<'query', 'public' | 'internal'>
type AnyMutationRef = FunctionReference<'mutation', 'public' | 'internal'>
type AnyActionRef = FunctionReference<'action', 'public' | 'internal'>

function resolveEvent(event?: H3Event) {
  const currentEvent = event ?? useEvent()
  if (!currentEvent) {
    throw new Error('No Nitro request context available for MCP Convex admin call.')
  }
  return currentEvent
}

function resolveAdminClientConfig(event?: H3Event): AdminClientConfig {
  const currentEvent = resolveEvent(event)
  const runtimeConfig = useRuntimeConfig(currentEvent)
  const convexUrl =
    runtimeConfig.public?.convex?.url ??
    process.env.NUXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('Convex URL is not configured for MCP admin calls.')
  }

  const deployKey = process.env.CONVEX_DEPLOY_KEY?.trim()
  if (!deployKey) {
    throw new Error('CONVEX_DEPLOY_KEY is required for MCP admin calls.')
  }

  return {
    event: currentEvent,
    convexUrl,
    deployKey,
  }
}

function getAdminClient(
  config: Pick<AdminClientConfig, 'convexUrl' | 'deployKey'> & {
    actingAsIdentity?: UserIdentityAttributes
  },
): AdminConvexHttpClient {
  const cacheKey = `${config.convexUrl}::${config.deployKey}::${JSON.stringify(config.actingAsIdentity ?? null)}`
  let client = adminClientCache.get(cacheKey)
  if (!client) {
    client = new ConvexHttpClient(config.convexUrl) as AdminConvexHttpClient
    client.setAdminAuth(config.deployKey, config.actingAsIdentity)
    adminClientCache.set(cacheKey, client)
  }
  return client
}

export function getAdminConvexClient(event?: H3Event, actingAsIdentity?: UserIdentityAttributes) {
  const config = resolveAdminClientConfig(event)
  return {
    event: config.event,
    client: getAdminClient({ ...config, actingAsIdentity }),
  }
}

export function createAdminConvexCaller(
  event?: H3Event,
  actingAsIdentity?: UserIdentityAttributes,
) {
  const { client } = getAdminConvexClient(event, actingAsIdentity)

  return {
    query: async <Query extends AnyQueryRef>(
      fn: Query,
      args?: FunctionArgs<Query>,
    ): Promise<FunctionReturnType<Query>> =>
      (await client.query(fn as FunctionReference<'query'>, args)) as Promise<
        FunctionReturnType<Query>
      >,
    mutation: async <Mutation extends AnyMutationRef>(
      fn: Mutation,
      args?: FunctionArgs<Mutation>,
    ): Promise<FunctionReturnType<Mutation>> =>
      (await client.mutation(fn as FunctionReference<'mutation'>, args)) as Promise<
        FunctionReturnType<Mutation>
      >,
    action: async <Action extends AnyActionRef>(
      fn: Action,
      args?: FunctionArgs<Action>,
    ): Promise<FunctionReturnType<Action>> =>
      (await client.action(fn as FunctionReference<'action'>, args)) as Promise<
        FunctionReturnType<Action>
      >,
  }
}
