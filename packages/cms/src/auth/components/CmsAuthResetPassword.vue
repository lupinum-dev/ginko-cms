<script setup lang="ts">
import { Loader2 } from '@lucide/vue'

import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { navigateTo, ref, useConvexAuth, useRoute } from '#imports'

import CmsPasswordInput from './CmsPasswordInput.vue'

const props = defineProps<{
  redirectTo: string
  studioRoute: string
}>()

const auth = useConvexAuth()
const route = useRoute()
const { t } = useCmsI18n()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const providerError = typeof route.query.error === 'string' ? route.query.error : ''
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const error = ref(providerError || !token ? t('ginkoCms.auth.recovery.invalidToken') : '')

function recoveryPath() {
  const query = new URLSearchParams({ redirect: props.redirectTo })
  return `${props.studioRoute}/auth/recover?${query.toString()}`
}

async function onSubmit() {
  error.value = ''
  if (!token) {
    error.value = t('ginkoCms.auth.recovery.invalidToken')
    return
  }
  if (password.value.length < 8) {
    error.value = t('ginkoCms.auth.signUp.passwordMinLength')
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('ginkoCms.auth.signUp.passwordMismatch')
    return
  }
  submitting.value = true
  try {
    const result = await auth.client?.resetPassword({ newPassword: password.value, token })
    if (!result || result.error) {
      error.value = t('ginkoCms.auth.recovery.invalidToken')
      return
    }
    const query = new URLSearchParams({ redirect: props.redirectTo, recovered: '1' })
    await navigateTo(`${props.studioRoute}/auth/signin?${query.toString()}`, { replace: true })
  } catch {
    error.value = t('ginkoCms.auth.recovery.invalidToken')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="cms-auth-stack">
    <form class="cms-auth-form" data-testid="cms-auth-reset-form" @submit.prevent="onSubmit">
      <div v-if="error" class="cms-auth-error" role="alert" data-testid="cms-auth-reset-error">
        {{ error }}
      </div>
      <template v-if="token && !providerError">
        <div class="cms-auth-field">
          <label for="new-password" class="cms-auth-label">
            {{ t('ginkoCms.auth.recovery.newPassword') }}
          </label>
          <CmsPasswordInput
            id="new-password"
            v-model="password"
            data-testid="cms-auth-reset-password"
            :disabled="submitting"
            auto-complete="new-password"
          />
        </div>
        <div class="cms-auth-field">
          <label for="confirm-new-password" class="cms-auth-label">
            {{ t('ginkoCms.auth.recovery.confirmPassword') }}
          </label>
          <CmsPasswordInput
            id="confirm-new-password"
            v-model="confirmPassword"
            data-testid="cms-auth-reset-confirm-password"
            :disabled="submitting"
            auto-complete="new-password"
          />
        </div>
        <button type="submit" class="cms-auth-submit" :disabled="submitting">
          <Loader2 v-if="submitting" class="cms-auth-spinner cms-auth-spinner--sm" />
          {{ t('ginkoCms.auth.recovery.resetSubmit') }}
        </button>
      </template>
    </form>
    <div class="cms-auth-link-row">
      <NuxtLink :to="recoveryPath()" class="cms-auth-link">
        {{ t('ginkoCms.auth.recovery.requestAnother') }}
      </NuxtLink>
    </div>
  </div>
</template>
