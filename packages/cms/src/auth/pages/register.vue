<script setup lang="ts">
import { useCmsConfig } from '#ginko-cms-public/composables/useCmsConfig.js'
import { useCmsI18n } from '#ginko-cms-public/composables/useCmsI18n.js'
import { computed, useSeoMeta } from '#imports'

import CmsAuthLayout from '../components/CmsAuthLayout.vue'
import CmsAuthSignUp from '../components/CmsAuthSignUp.vue'

const cmsConfig = useCmsConfig()
const studioRoute = (cmsConfig.route ?? '/studio').replace(/\/$/, '')
const { t } = useCmsI18n()
useSeoMeta({
  title: computed(() => t('ginkoCms.auth.pages.register.title')),
  description: computed(() => t('ginkoCms.auth.pages.register.description')),
})
</script>

<template>
  <CmsAuthLayout>
    <div class="cms-auth-stack">
      <div class="cms-auth-heading">
        <h1>
          {{ t('ginkoCms.auth.pages.register.title') }}
        </h1>
        <p>
          {{ t('ginkoCms.auth.pages.register.description') }}
        </p>
      </div>
      <CmsAuthSignUp :redirect-to="studioRoute" />
    </div>
  </CmsAuthLayout>
</template>
