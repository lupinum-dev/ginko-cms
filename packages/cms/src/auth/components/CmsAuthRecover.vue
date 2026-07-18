<script setup lang="ts">
import { Loader2 } from '@lucide/vue'

import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { computed, ref, useConvexAuth, useRoute } from '#imports'

import CmsAuthInput from './CmsAuthInput.vue'

const props = defineProps<{
  redirectTo: string
  studioRoute: string
}>()

const auth = useConvexAuth()
const route = useRoute()
const { t } = useCmsI18n()
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const submitting = ref(false)
const submitted = ref(false)
const disabled = computed(() => submitting.value || submitted.value)

function signInPath() {
  const query = new URLSearchParams({ redirect: props.redirectTo })
  if (email.value) query.set('email', email.value)
  return `${props.studioRoute}/auth/signin?${query.toString()}`
}

async function onSubmit() {
  if (!email.value || submitting.value) return
  submitting.value = true
  try {
    const callbackPath = `${props.studioRoute}/auth/reset-password?${new URLSearchParams({
      redirect: props.redirectTo,
    }).toString()}`
    const redirectTo = new URL(callbackPath, window.location.origin).toString()
    await auth.client?.requestPasswordReset({ email: email.value, redirectTo })
  } catch {
    // Recovery is deliberately enumeration-safe. Known/unknown identities and
    // delivery failures receive the same browser response; operators diagnose
    // provider failures through server-side setup/health tooling.
  } finally {
    submitted.value = true
    submitting.value = false
  }
}
</script>

<template>
  <div class="cms-auth-stack">
    <div
      v-if="submitted"
      class="cms-auth-message"
      role="status"
      data-testid="cms-auth-recovery-submitted"
    >
      {{ t('ginkoCms.auth.recovery.submitted') }}
    </div>
    <form
      v-else
      class="cms-auth-form"
      data-testid="cms-auth-recovery-form"
      @submit.prevent="onSubmit"
    >
      <div class="cms-auth-field">
        <label for="recovery-email" class="cms-auth-label">
          {{ t('ginkoCms.common.email') }}
        </label>
        <CmsAuthInput
          id="recovery-email"
          v-model="email"
          type="email"
          required
          data-testid="cms-auth-recovery-email"
          :placeholder="t('ginkoCms.auth.placeholders.email')"
          :disabled="disabled"
          auto-capitalize="none"
          auto-complete="email"
          auto-correct="off"
        />
      </div>
      <button type="submit" class="cms-auth-submit" :disabled="disabled">
        <Loader2 v-if="submitting" class="cms-auth-spinner cms-auth-spinner--sm" />
        {{ t('ginkoCms.auth.recovery.submit') }}
      </button>
    </form>
    <div class="cms-auth-link-row">
      <NuxtLink :to="signInPath()" class="cms-auth-link">
        {{ t('ginkoCms.auth.recovery.backToSignIn') }}
      </NuxtLink>
    </div>
  </div>
</template>
