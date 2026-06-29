import type { FunctionArgs, FunctionReference } from 'convex/server'

export function createCmsComponentBridge() {
  throw new Error('TODO(trellis-cutover): restore the Ginko-owned component bridge in Phase 7')
}

export function componentArgs<
  TRef extends FunctionReference<'query' | 'mutation' | 'action', 'public' | 'internal'>,
>(args: unknown) {
  return args as FunctionArgs<TRef>
}

