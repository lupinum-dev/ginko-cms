import { onMounted, ref, useConvexConfig, useRoute } from '#imports'

import { parseSignedOAuthTransaction, requirePublicOAuthClient } from './transaction.js'

export interface VerifiedOAuthTransaction {
  clientId: string
  clientName: string
  resource: string
  scopes: string[]
  signedQuery: string
}

export function useVerifiedOAuthTransaction() {
  const route = useRoute()
  const convexConfig = useConvexConfig()
  const transaction = ref<VerifiedOAuthTransaction | null>(null)
  const loading = ref(true)
  const errorMessage = ref('')

  onMounted(async () => {
    try {
      const pending = parseSignedOAuthTransaction(route.fullPath, convexConfig.siteUrl)

      const response = await fetch('/api/auth/oauth2/public-client-prelogin', {
        body: JSON.stringify({
          client_id: pending.clientId,
          oauth_query: pending.signedQuery,
        }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) throw new Error('OAUTH_TRANSACTION_INVALID')
      const client = requirePublicOAuthClient(await response.json(), pending.clientId)
      transaction.value = {
        clientId: client.clientId,
        clientName: client.clientName,
        resource: pending.resource,
        scopes: pending.scopes,
        signedQuery: pending.signedQuery,
      }
    } catch {
      errorMessage.value =
        'This authorization request is invalid or expired. Start again in the client.'
    } finally {
      loading.value = false
    }
  })

  return { errorMessage, loading, transaction }
}
