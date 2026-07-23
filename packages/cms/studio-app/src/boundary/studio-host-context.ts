import {
  createBetterConvexAttachment,
  type BetterConvexAttachedRuntime,
} from "better-convex-vue/embedded";
import { hasInjectionContext, inject, type InjectionKey } from "vue";

import { readHostBridge, type HostBridge } from "./host-bridge";

export interface StudioHostContext {
  getBridge: () => HostBridge;
  runtime: BetterConvexAttachedRuntime;
}

export const studioHostContextKey: InjectionKey<StudioHostContext> = Symbol(
  "ginko-cms.studioHost",
);

export function createStudioHostContext(
  getBridge: () => HostBridge = readHostBridge,
) {
  const bridgeRuntime = getBridge().runtime;
  const runtime = createBetterConvexAttachment({
    client: bridgeRuntime.client,
    anonymousClient: bridgeRuntime.anonymousClient,
    identity: bridgeRuntime.identity,
    connection: bridgeRuntime.connection,
  });

  return {
    getBridge,
    runtime,
  } satisfies StudioHostContext;
}

const fallbackStudioHostContext = createStudioHostContext();

export function useStudioHostContext(): StudioHostContext {
  if (hasInjectionContext()) {
    return inject(studioHostContextKey, fallbackStudioHostContext);
  }
  return fallbackStudioHostContext;
}
