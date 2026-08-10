<script setup lang="ts">
import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { resolveRedirectTarget } from '#ginko-cms-public/utils/redirectSafety.js'
import { computed, navigateTo, onMounted, ref, useConvexAuth, useRoute, watch } from '#imports'

import CmsAuthInput from './CmsAuthInput.vue'
import CmsPasswordInput from './CmsPasswordInput.vue'

const props = defineProps<{
  redirectTo: string
}>()
const auth = useConvexAuth()
const isAuthenticated = computed(() => auth.status.value === 'authenticated')
const isPending = auth.isPending
const isSubmitting = ref(false)
const authError = ref<Error | null>(null)
const route = useRoute()
const { t } = useCmsI18n()
const name = ref('')
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const password = ref('')
const confirmPassword = ref('')
const error = ref<string | null>(null)
const authFormReady = ref(false)
let authRedirectStarted = false
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
function getRedirectTarget() {
  return resolveRedirectTarget(
    typeof route.query.redirect === 'string' ? route.query.redirect : null,
    props.redirectTo,
    `${props.redirectTo.replace(/\/$/, '')}/auth/signin`,
  )
}
async function redirectAuthenticatedUser() {
  if (authRedirectStarted) return
  authRedirectStarted = true
  await navigateTo(getRedirectTarget(), { replace: true })
}
watch(
  [isAuthenticated, isSubmitting],
  ([authenticated, submitting]) => {
    // A submitted registration owns its post-operation navigation below. The
    // watcher exists only for an already-authenticated cold load.
    if (authenticated && !submitting) void redirectAuthenticatedUser()
  },
  { immediate: true },
)
function toSignIn(): string {
  const query = new URLSearchParams()
  const redirect = getRedirectTarget()
  if (redirect) {
    query.set('redirect', redirect)
  }
  if (email.value) {
    query.set('email', email.value)
  }
  return `${props.redirectTo.replace(/\/$/, '')}/auth/signin${query.size ? `?${query.toString()}` : ''}`
}
onMounted(() => {
  authFormReady.value = true
})

async function onSubmit(event: Event) {
  event.preventDefault()
  if (!name.value || !email.value || !password.value || !confirmPassword.value) {
    error.value = t('ginkoCms.auth.signUp.errorFallback')
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('ginkoCms.auth.signUp.passwordMismatch')
    return
  }
  if (password.value.length < 8) {
    error.value = t('ginkoCms.auth.signUp.passwordMinLength')
    return
  }
  error.value = null
  authError.value = null
  isSubmitting.value = true
  try {
    // Sign-up resolves atomically after the Convex identity is synced (vNext
    // §5.3): no manual refresh, no watch-based redirect — navigate on success.
    if (!auth.client) throw new TypeError('Ginko CMS authentication client is unavailable.')
    const result = await auth.client.signUp.email({
      email: email.value,
      password: password.value,
      name: name.value,
    })
    if (result.error) {
      const message = result.error.message ?? t('ginkoCms.auth.signUp.errorFallback')
      authError.value = new Error(message)
      error.value = message
      return
    }
    await redirectAuthenticatedUser()
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : t('ginkoCms.auth.signUp.errorFallback')
    authError.value = caught instanceof Error ? caught : new Error(message)
    error.value = message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="cms-auth-form">
    <div v-if="isRedirecting" class="cms-auth-loader">
      <span class="cms-auth-spinner" aria-hidden="true" />
    </div>

    <template v-else>
      <form
        data-testid="cms-auth-register-form"
        :data-auth-ready="authFormReady ? 'true' : 'false'"
        @submit.prevent="onSubmit"
      >
        <div class="cms-auth-fields">
          <div v-if="error" class="cms-auth-error" data-testid="cms-auth-register-error">
            {{ error }}
          </div>
          <div class="cms-auth-field">
            <label for="name" class="cms-auth-label">
              {{ t('ginkoCms.common.name') }}
            </label>
            <CmsAuthInput
              id="name"
              v-model="name"
              :placeholder="t('ginkoCms.auth.placeholders.name')"
              type="text"
              auto-capitalize="none"
              auto-complete="name"
              auto-correct="off"
              :disabled="isLoading"
            />
          </div>
          <div class="cms-auth-field">
            <label for="email" class="cms-auth-label">
              {{ t('ginkoCms.common.email') }}
            </label>
            <CmsAuthInput
              id="email"
              v-model="email"
              :placeholder="t('ginkoCms.auth.placeholders.email')"
              type="email"
              data-testid="cms-auth-register-email"
              auto-capitalize="none"
              auto-complete="email"
              auto-correct="off"
              :disabled="isLoading"
            />
          </div>
          <div class="cms-auth-field">
            <label for="password" class="cms-auth-label">
              {{ t('ginkoCms.common.password') }}
            </label>
            <CmsPasswordInput
              id="password"
              v-model="password"
              data-testid="cms-auth-register-password"
              :disabled="isLoading"
            />
          </div>
          <div class="cms-auth-field">
            <label for="confirm-password" class="cms-auth-label">
              {{ t('ginkoCms.common.confirmPassword') }}
            </label>
            <CmsPasswordInput
              id="confirm-password"
              v-model="confirmPassword"
              data-testid="cms-auth-register-confirm-password"
              :disabled="isLoading"
            />
          </div>
          <button
            type="submit"
            class="cms-auth-submit"
            data-testid="cms-auth-register-submit"
            :disabled="isLoading"
          >
            <span
              v-if="isLoading"
              class="cms-auth-spinner cms-auth-spinner--sm"
              aria-hidden="true"
            />
            {{ t('ginkoCms.auth.signUp.submit') }}
          </button>
        </div>
      </form>
      <div class="cms-auth-link-row">
        {{ t('ginkoCms.auth.signUp.hasAccount') }}
        <NuxtLink :to="toSignIn()" class="cms-auth-link">
          {{ t('ginkoCms.auth.signUp.signIn') }}
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
