import { ConvexHttpClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { H3Event } from 'h3'
import { useEvent, useRuntimeConfig } from 'nitropack/runtime'

type ConvexClientConfig = {
  event: H3Event
  convexUrl: string
  authToken: string
}

type AnyQueryRef = FunctionReference<'query', 'public' | 'internal'>
type AnyMutationRef = FunctionReference<'mutation', 'public' | 'internal'>
type AnyActionRef = FunctionReference<'action', 'public' | 'internal'>

function resolveEvent(event?: H3Event) {
  const currentEvent = event ?? useEvent()
  if (!currentEvent) {
    throw new Error('No Nitro request context available for MCP Convex call.')
  }
  return currentEvent
}

function resolveConvexClientConfig(
  event: H3Event | undefined,
  authToken: string,
): ConvexClientConfig {
  const currentEvent = resolveEvent(event)
  const runtimeConfig = useRuntimeConfig(currentEvent)
  const convexUrl =
    runtimeConfig.public?.convex?.url ??
    process.env.NUXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('Convex URL is not configured for MCP calls.')
  }

  return {
    event: currentEvent,
    convexUrl,
    authToken,
  }
}

function getConvexClient(config: Pick<ConvexClientConfig, 'convexUrl' | 'authToken'>) {
  const client = new ConvexHttpClient(config.convexUrl)
  client.setAuth(config.authToken)
  return client
}

export function createConvexAuthCaller(event: H3Event | undefined, authToken: string) {
  const config = resolveConvexClientConfig(event, authToken)
  const client = getConvexClient(config)

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
