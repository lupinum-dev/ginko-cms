<script setup lang="ts">
import { ref } from '#imports'

import CmsAuthLayout from '../components/CmsAuthLayout.vue'
import { useVerifiedOAuthTransaction } from '../oauth/useVerifiedOAuthTransaction.js'

defineOptions({ name: 'GinkoMcpOAuthLoginPage' })

const email = ref('')
const password = ref('')
const pending = ref(false)
const signInError = ref('')
const { errorMessage, loading, transaction } = useVerifiedOAuthTransaction()

async function signIn() {
  if (!transaction.value) return
  pending.value = true
  signInError.value = ''
  try {
    const response = await fetch('/api/auth/sign-in/email', {
      body: JSON.stringify({
        email: email.value.trim().toLowerCase(),
        oauth_query: transaction.value.signedQuery,
        password: password.value,
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const body = (await response.json()) as { url?: unknown }
    if (!response.ok || typeof body.url !== 'string' || !body.url) {
      throw new Error('SIGN_IN_FAILED')
    }
    window.location.assign(body.url)
  } catch {
    signInError.value = 'Sign in failed.'
    pending.value = false
  }
}
</script>

<template>
  <CmsAuthLayout>
    <div class="cms-auth-stack">
      <div class="cms-auth-heading">
        <h1>Sign in to authorize MCP access</h1>
        <p v-if="loading">Verifying the authorization request…</p>
        <template v-else-if="transaction">
          <p>
            <strong>{{ transaction.clientName }}</strong> is requesting access.
          </p>
          <p>
            Resource: <code>{{ transaction.resource }}</code>
          </p>
          <p>Scopes: {{ transaction.scopes.join(', ') }}</p>
        </template>
        <p v-else role="alert">{{ errorMessage }}</p>
      </div>
      <form v-if="transaction" class="cms-auth-form" @submit.prevent="signIn">
        <label class="cms-auth-field">
          <span class="cms-auth-label">Email</span>
          <input v-model="email" data-testid="oauth-email" type="email" required />
        </label>
        <label class="cms-auth-field">
          <span class="cms-auth-label">Password</span>
          <input v-model="password" data-testid="oauth-password" type="password" required />
        </label>
        <p v-if="signInError" class="cms-auth-error" role="alert">{{ signInError }}</p>
        <button data-testid="oauth-sign-in" :disabled="pending || loading" type="submit">
          Sign in
        </button>
      </form>
    </div>
  </CmsAuthLayout>
</template>
