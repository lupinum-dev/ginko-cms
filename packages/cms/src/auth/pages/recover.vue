<script setup lang="ts">
import { useCmsConfig } from '#ginko-cms-public/composables/useCmsConfig.js'
import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { resolveRedirectTarget } from '#ginko-cms-public/utils/redirectSafety.js'
import { computed, useRoute, useSeoMeta } from '#imports'

import CmsAuthLayout from '../components/CmsAuthLayout.vue'
import CmsAuthRecover from '../components/CmsAuthRecover.vue'

const cmsConfig = useCmsConfig()
const studioRoute = (cmsConfig.route ?? '/studio').replace(/\/$/, '')
const route = useRoute()
const { t } = useCmsI18n()
const redirectTo = computed(() =>
  resolveRedirectTarget(
    typeof route.query.redirect === 'string' ? route.query.redirect : null,
    studioRoute,
    `${studioRoute}/auth/recover`,
  ),
)

useSeoMeta({
  title: computed(() => t('ginkoCms.auth.pages.recovery.title')),
  description: computed(() => t('ginkoCms.auth.pages.recovery.description')),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <CmsAuthLayout>
    <div class="cms-auth-stack">
      <div class="cms-auth-heading">
        <h1>{{ t('ginkoCms.auth.pages.recovery.title') }}</h1>
        <p>{{ t('ginkoCms.auth.pages.recovery.description') }}</p>
      </div>
      <CmsAuthRecover :redirect-to="redirectTo" :studio-route="studioRoute" />
    </div>
  </CmsAuthLayout>
</template>
