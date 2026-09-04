<script setup lang="ts">
import { ref } from '#imports'

import CmsAuthLayout from '../components/CmsAuthLayout.vue'
import { useVerifiedOAuthTransaction } from '../oauth/useVerifiedOAuthTransaction.js'

defineOptions({ name: 'GinkoMcpOAuthConsentPage' })

const pending = ref(false)
const consentError = ref('')
const { errorMessage, loading, transaction } = useVerifiedOAuthTransaction()

async function decide(accept: boolean) {
  if (!transaction.value) return
  pending.value = true
  consentError.value = ''
  try {
    const response = await fetch('/api/auth/oauth2/consent', {
      body: JSON.stringify({
        accept,
        oauth_query: transaction.value.signedQuery,
        ...(accept ? { scope: transaction.value.scopes.join(' ') } : {}),
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const body = (await response.json()) as { url?: unknown }
    if (!response.ok || typeof body.url !== 'string' || !body.url) {
      throw new Error('CONSENT_FAILED')
    }
    window.location.assign(body.url)
  } catch {
    consentError.value = 'The authorization decision could not be completed.'
    pending.value = false
  }
}
</script>

<template>
  <CmsAuthLayout>
    <div class="cms-auth-stack">
      <div class="cms-auth-heading">
        <h1>Authorize MCP access</h1>
        <p v-if="loading">Verifying the authorization request…</p>
        <template v-else-if="transaction">
          <p>
            <strong>{{ transaction.clientName }}</strong> requests delegated access.
          </p>
          <p>
            Resource: <code>{{ transaction.resource }}</code>
          </p>
          <ul>
            <li v-for="scope in transaction.scopes" :key="scope">{{ scope }}</li>
          </ul>
          <p>Current membership and delegation are checked again for every tool call.</p>
        </template>
        <p v-else role="alert">{{ errorMessage }}</p>
      </div>
      <p v-if="consentError" class="cms-auth-error" role="alert">{{ consentError }}</p>
      <div v-if="transaction" class="cms-auth-actions">
        <button data-testid="oauth-deny" :disabled="pending" type="button" @click="decide(false)">
          Deny
        </button>
        <button data-testid="oauth-approve" :disabled="pending" type="button" @click="decide(true)">
          Approve
        </button>
      </div>
    </div>
  </CmsAuthLayout>
</template>
