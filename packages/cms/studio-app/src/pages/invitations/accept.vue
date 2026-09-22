<script setup lang="ts">
import { CheckCircle2, KeyRound } from '@lucide/vue'
import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorCode } from '@public/utils/cmsErrors'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../../boundary/api'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useConvexMutation } from '../../composables/useStudioConvex'
import {
  memberInvitationTokenProof,
  readMemberInvitationToken,
  removeInvitationTokenFromAddress,
} from '../../lib/memberInvitation'

const route = useRoute()
const { t } = useCmsI18n()
const rawToken = ref(readMemberInvitationToken(route.hash))
const status = ref<'idle' | 'accepting' | 'accepted' | 'error'>('idle')
const acceptedRole = ref<CmsRole | null>(null)
const failure = ref<'invalid' | 'temporary' | null>(null)
let retainedProof: string | null = null
const acceptInvitation = useConvexMutation(api.ginkoCms.members.acceptMemberInvitation)

onMounted(removeInvitationTokenFromAddress)
onBeforeUnmount(() => {
  rawToken.value = ''
  retainedProof = null
})

async function handleAcceptInvitation() {
  if (status.value === 'accepting' || status.value === 'accepted') return
  status.value = 'accepting'
  failure.value = null
  try {
    const proof = retainedProof ?? (await memberInvitationTokenProof(rawToken.value))
    rawToken.value = ''
    if (!proof) {
      failure.value = 'invalid'
      status.value = 'error'
      return
    }
    // A transport failure must not consume the only local copy. Retain only the
    // derived proof in this mounted page until success or a definitive rejection.
    retainedProof = proof
    const member = await acceptInvitation({ tokenProof: proof })
    retainedProof = null
    acceptedRole.value = member.role
    status.value = 'accepted'
  } catch (error) {
    failure.value = getCmsErrorCode(error) === 'MEMBER_INVITATION_INVALID' ? 'invalid' : 'temporary'
    if (failure.value === 'invalid') retainedProof = null
    status.value = 'error'
  }
}

function openStudio() {
  window.location.assign(new URL('../', window.location.href))
}
</script>

<template>
  <main class="ginko:w-full ginko:max-w-lg" aria-labelledby="member-invitation-title">
    <Card>
      <CardHeader>
        <div
          class="ginko:mb-2 ginko:flex ginko:size-10 ginko:items-center ginko:justify-center ginko:rounded-full ginko:bg-muted"
        >
          <CheckCircle2
            v-if="status === 'accepted'"
            class="ginko:size-5 ginko:text-foreground"
            aria-hidden="true"
          />
          <KeyRound v-else class="ginko:size-5 ginko:text-muted-foreground" aria-hidden="true" />
        </div>
        <CardTitle id="member-invitation-title">
          {{
            status === 'accepted'
              ? t('ginkoCms.studio.invitationPage.acceptedTitle')
              : t('ginkoCms.studio.invitationPage.title')
          }}
        </CardTitle>
        <CardDescription>
          {{
            status === 'accepted'
              ? t('ginkoCms.studio.invitationPage.acceptedDescription', {
                  role: acceptedRole ?? '',
                })
              : t('ginkoCms.studio.invitationPage.description')
          }}
        </CardDescription>
      </CardHeader>
      <CardContent class="ginko:space-y-4">
        <StudioNotice
          v-if="status === 'error'"
          tone="danger"
          :description="
            failure === 'temporary'
              ? t('ginkoCms.studio.invitationPage.retryDescription')
              : t('ginkoCms.studio.invitationPage.invalid')
          "
          role="alert"
        />
        <p v-else-if="status !== 'accepted'" class="ginko:text-xs ginko:text-muted-foreground">
          {{ t('ginkoCms.studio.invitationPage.identityNotice') }}
        </p>
        <Button
          v-if="status === 'accepted'"
          class="ginko:w-full"
          data-testid="cms-member-invitation-open"
          @click="openStudio"
        >
          {{ t('ginkoCms.studio.invitationPage.openStudio') }}
        </Button>
        <Button
          v-else
          class="ginko:w-full"
          data-testid="cms-member-invitation-accept"
          :disabled="status === 'accepting' || failure === 'invalid'"
          @click="handleAcceptInvitation"
        >
          {{
            status === 'accepting'
              ? t('ginkoCms.studio.invitationPage.accepting')
              : failure === 'temporary'
                ? t('ginkoCms.studio.invitationPage.retry')
                : t('ginkoCms.studio.invitationPage.accept')
          }}
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
