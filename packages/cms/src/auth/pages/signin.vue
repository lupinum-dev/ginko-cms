<script setup lang="ts">
import { useCmsConfig } from '#ginko-cms-public/composables/useCmsConfig.js'
import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { computed, useRoute, useSeoMeta } from '#imports'

import CmsAuthLayout from '../components/CmsAuthLayout.vue'
import CmsAuthSignIn from '../components/CmsAuthSignIn.vue'

const cmsConfig = useCmsConfig()
const studioRoute = (cmsConfig.route ?? '/studio').replace(/\/$/, '')
const route = useRoute()
const { t } = useCmsI18n()
const redirectTo = computed<string>(() => {
  const target = route.query.redirect
  if (typeof target === 'string' && target.startsWith('/')) {
    return target
  }
  return studioRoute
})
useSeoMeta({
  title: computed(() => t('ginkoCms.auth.pages.signIn.title')),
  description: computed(() =>
    t('ginkoCms.auth.pages.signIn.description', { target: redirectTo.value }),
  ),
})
</script>

<template>
  <CmsAuthLayout>
    <div class="cms-auth-stack">
      <div class="cms-auth-heading">
        <h1>
          {{ t('ginkoCms.auth.pages.signIn.title') }}
        </h1>
        <p>
          {{ t('ginkoCms.auth.pages.signIn.description', { target: redirectTo }) }}
        </p>
      </div>
      <CmsAuthSignIn :redirect-to="studioRoute" />
    </div>
  </CmsAuthLayout>
</template>
