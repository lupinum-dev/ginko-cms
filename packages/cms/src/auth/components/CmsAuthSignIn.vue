<script setup lang="ts">
import { Loader2 } from '@lucide/vue'

import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { resolveRedirectTarget } from '#ginko-cms-public/utils/redirectSafety.js'
import { computed, navigateTo, onMounted, ref, useConvexAuth, useRoute } from '#imports'

import CmsAuthInput from './CmsAuthInput.vue'
import CmsPasswordInput from './CmsPasswordInput.vue'

const props = defineProps<{
  redirectTo: string
}>()
// `useConvexAuth()` is called unconditionally (vNext §5.3/§10.3): it is
// auto-imported, SSR-safe, and independent of any runtime-config auth flag.
const auth = useConvexAuth()
const isAuthenticated = auth.isAuthenticated
const isPending = auth.isPending
const isSubmitting = ref(false)
const authError = ref<Error | null>(null)
const route = useRoute()
const { t } = useCmsI18n()
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const password = ref('')
const error = ref<string | null>(null)
const authFormReady = ref(false)
const isLoading = computed(() => isSubmitting.value)
const isRedirecting = computed(
  // Auth state is client-owned and may start pending after SSR. Keep the
  // server and first client render identical, then reveal the form on mount.
  () =>
    !authFormReady.value ||
    isPending.value ||
    isAuthenticated.value ||
    (isSubmitting.value && !authError.value),
)
onMounted(() => {
  authFormReady.value = true
})

function getRedirectTarget() {
  return resolveRedirectTarget(
    typeof route.query.redirect === 'string' ? route.query.redirect : null,
    props.redirectTo,
    `${props.redirectTo.replace(/\/$/, '')}/auth/signin`,
  )
}
function toRegister(): string {
  const query = new URLSearchParams()
  const redirect = getRedirectTarget()
  if (redirect) {
    query.set('redirect', redirect)
  }
  if (email.value) {
    query.set('email', email.value)
  }
  return `${props.redirectTo.replace(/\/$/, '')}/auth/register${query.size ? `?${query.toString()}` : ''}`
}
function toRecovery(): string {
  const query = new URLSearchParams({ redirect: getRedirectTarget() })
  if (email.value) query.set('email', email.value)
  return `${props.redirectTo.replace(/\/$/, '')}/auth/recover?${query.toString()}`
}
async function onSubmit(event: Event) {
  event.preventDefault()
  if (!email.value || !password.value) {
    error.value = t('ginkoCms.auth.signIn.errorFallback')
    return
  }
  error.value = null
  authError.value = null
  isSubmitting.value = true
  try {
    // Sign-in resolves atomically after the Convex identity is synced (vNext
    // §5.3): no manual refresh, no watch-based redirect — navigate on success.
    const result = await auth.signIn.email({
      email: email.value,
      password: password.value,
    })
    if (result.error) {
      const message = result.error.message ?? t('ginkoCms.auth.signIn.errorFallback')
      authError.value = new Error(message)
      error.value = message
      return
    }
    await navigateTo(getRedirectTarget(), { replace: true })
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : t('ginkoCms.auth.signIn.errorFallback')
    authError.value = caught instanceof Error ? caught : new Error(message)
    error.value = message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div v-if="isRedirecting" class="cms-auth-loader">
    <Loader2 class="cms-auth-spinner" />
  </div>

  <template v-else>
    <form
      class="cms-auth-form"
      data-testid="cms-auth-form"
      :data-auth-ready="authFormReady ? 'true' : 'false'"
      @submit.prevent="onSubmit"
    >
      <div v-if="error" class="cms-auth-error" data-testid="cms-auth-error">
        {{ error }}
      </div>
      <div class="cms-auth-field">
        <label for="email" class="cms-auth-label">
          {{ t('ginkoCms.common.email') }}
        </label>
        <CmsAuthInput
          id="email"
          v-model="email"
          type="email"
          data-testid="cms-auth-email"
          :placeholder="t('ginkoCms.auth.placeholders.email')"
          :disabled="isLoading"
          auto-capitalize="none"
          auto-complete="email"
          auto-correct="off"
        />
      </div>
      <div class="cms-auth-field">
        <div class="cms-auth-label-row">
          <label for="password" class="cms-auth-label">
            {{ t('ginkoCms.common.password') }}
          </label>
          <NuxtLink :to="toRecovery()" class="cms-auth-link">
            {{ t('ginkoCms.auth.signIn.forgotPassword') }}
          </NuxtLink>
        </div>
        <CmsPasswordInput
          id="password"
          v-model="password"
          data-testid="cms-auth-password"
          :disabled="isLoading"
        />
      </div>
      <button
        type="submit"
        class="cms-auth-submit"
        data-testid="cms-auth-submit"
        :disabled="isLoading"
      >
        <Loader2 v-if="isLoading" class="cms-auth-spinner cms-auth-spinner--sm" />
        {{ t('ginkoCms.auth.signIn.submit') }}
      </button>
    </form>
    <div class="cms-auth-link-row">
      {{ t('ginkoCms.auth.signIn.noAccount') }}
      <NuxtLink :to="toRegister()" class="cms-auth-link">
        {{ t('ginkoCms.auth.signIn.signUp') }}
      </NuxtLink>
    </div>
  </template>
</template>
