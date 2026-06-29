<script setup lang="ts">
import { useConvexAuth } from 'better-convex-nuxt/composables'
import { Loader2 } from 'lucide-vue-next'

import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { resolveRedirectTarget } from '#ginko-cms-public/utils/redirectSafety.js'
import { computed, navigateTo, onMounted, ref, useRoute, useRuntimeConfig, watch } from '#imports'

import CmsAuthInput from './CmsAuthInput.vue'
import CmsPasswordInput from './CmsPasswordInput.vue'

const props = defineProps<{
  redirectTo: string
}>()
const runtimeConfig = useRuntimeConfig()
const authEnabled =
  (runtimeConfig.public as { convex?: { auth?: { enabled?: boolean } } }).convex?.auth?.enabled !==
  false
const auth = authEnabled ? useConvexAuth() : null
const isAuthenticated = auth?.isAuthenticated ?? ref(false)
const isPending = auth?.isPending ?? ref(false)
const signIn = auth?.signIn.email ?? null
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
  () => isPending.value || isAuthenticated.value || (isSubmitting.value && !authError.value),
)
onMounted(() => {
  authFormReady.value = true
  if (!authEnabled) {
    void navigateTo(getRedirectTarget())
  }
})

watch(
  [isAuthenticated, isPending],
  ([authenticated, pending]) => {
    if (!authEnabled || pending || !authenticated) return
    if (import.meta.dev) {
      console.debug('[ginko-cms] auth sign-in redirect', {
        redirectTo: getRedirectTarget(),
      })
    }
    void navigateTo(getRedirectTarget(), { replace: true })
  },
  { immediate: true },
)
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
async function onSubmit(event: Event) {
  event.preventDefault()
  if (!email.value || !password.value) {
    error.value = t('ginkoCms.auth.signIn.errorFallback')
    return
  }
  if (!signIn) {
    error.value = t('ginkoCms.auth.signIn.errorFallback')
    return
  }
  error.value = null
  isSubmitting.value = true
  try {
    await signIn(
      {
        email: email.value,
        password: password.value,
      },
      { redirectTo: getRedirectTarget() },
    )
    error.value = authError.value?.message || null
  } catch {
    error.value = t('ginkoCms.auth.signIn.errorFallback')
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
        <label for="password" class="cms-auth-label">
          {{ t('ginkoCms.common.password') }}
        </label>
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
