import { cmsDeployCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { createBridgeForwardingEnvelope } from '@lupinum/trellis-bridge/component'

const deployKeyCmsCaller = cmsDeployCaller('ginko-cms-cli')

export function withDeployKeyForwarding<TArgs extends Record<string, unknown>>(
  args: TArgs,
  options: {
    functionRef: string
    purpose: 'query' | 'mutation'
    identityForwardingKey: string
    envelopeArgs?: Record<string, unknown>
  },
): TArgs & { _trellisForwarding: string } {
  // Internal bridge root wrappers verify forwarding before app args are merged;
  // the component call they perform signs the real app args again.
  const envelopeArgs = options.envelopeArgs ?? args

  return {
    ...args,
    _trellisForwarding: createBridgeForwardingEnvelope({
      identityForwardingKey: options.identityForwardingKey,
      caller: deployKeyCmsCaller,
      operation: options.purpose,
      functionRef: options.functionRef,
      args: envelopeArgs,
      jtiPrefix: 'ginko-cms-cli',
    }),
  }
}
