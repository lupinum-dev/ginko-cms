<script setup lang="ts">
import { ChevronDown, LogOut } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useCmsAuthState } from '../../composables/useCmsAuthState'
import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useColorMode } from '../../composables/useColorMode'

const router = useRouter()

const { authEnabled, user, signOut } = useCmsAuthState()
const { t, currentLocale, studioLocales } = useCmsI18n()
const currentStudioLocale = computed(() =>
  studioLocales.value.find((l) => l.code === currentLocale.value),
)
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const colorMode = useColorMode()
const copiedId = ref(false)
const initials = computed(() => {
  const name = user.value?.name
  if (!name) return '?'
  return name
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})
function cycleColorMode() {
  const modes = ['system', 'light', 'dark'] as const
  const currentPreference = modes.includes(colorMode.preference as (typeof modes)[number])
    ? (colorMode.preference as (typeof modes)[number])
    : 'system'
  const current = modes.indexOf(currentPreference)
  colorMode.preference = modes[(current + 1) % modes.length] ?? 'system'
}
const colorModeIcon = computed(() => {
  if (colorMode.preference === 'dark') return 'lucide:moon'
  if (colorMode.preference === 'light') return 'lucide:sun'
  return 'lucide:monitor'
})
const colorModeLabel = computed(() => {
  if (colorMode.preference === 'dark') return t('ginkoCms.studio.userMenu.darkMode')
  if (colorMode.preference === 'light') return t('ginkoCms.studio.userMenu.lightMode')
  return t('ginkoCms.studio.userMenu.systemMode')
})
async function copyUserId() {
  if (!user.value?.id) return
  await navigator.clipboard.writeText(user.value.id)
  copiedId.value = true
  setTimeout(() => {
    copiedId.value = false
  }, 2e3)
}
async function handleSignOut() {
  if (!authEnabled.value) {
    return
  }
  await signOut()
  await router.push(`${studioRoute}/auth/signin`)
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2.5 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-left ginko:transition-colors ginko:hover:bg-muted/50 ginko:data-[state=open]:bg-muted/60 ginko:focus-visible:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-sidebar-ring/40"
          >
            <Avatar class="ginko:size-7 ginko:rounded-full ginko:ring-1 ginko:ring-border/50">
              <AvatarImage v-if="user?.image" :src="user.image" :alt="user?.name" />
              <AvatarFallback
                class="ginko:rounded-full ginko:bg-primary/10 ginko:text-[10px] ginko:font-semibold ginko:text-primary"
              >
                {{ initials }}
              </AvatarFallback>
            </Avatar>
            <div
              class="ginko:grid ginko:min-w-0 ginko:flex-1 ginko:text-left ginko:leading-tight ginko:group-data-[collapsible=icon]:hidden"
            >
              <span
                class="ginko:truncate ginko:text-[13px] ginko:font-medium ginko:text-foreground"
              >
                {{ user?.name ?? 'User' }}
              </span>
              <span class="ginko:truncate ginko:text-[11px] ginko:text-muted-foreground/70">{{
                user?.email
              }}</span>
            </div>
            <ChevronDown
              class="ginko:ml-auto ginko:size-3.5 ginko:shrink-0 ginko:text-muted-foreground/50 ginko:group-data-[collapsible=icon]:hidden"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="ginko:w-[--reka-popper-anchor-width] ginko:min-w-56 ginko:rounded-lg"
          side="bottom"
          align="end"
          :side-offset="4"
        >
          <DropdownMenuLabel class="ginko:p-0 ginko:font-normal">
            <div
              class="ginko:flex ginko:items-center ginko:gap-2 ginko:px-1 ginko:py-1.5 ginko:text-left ginko:text-sm"
            >
              <Avatar class="ginko:size-8 ginko:rounded-lg">
                <AvatarImage v-if="user?.image" :src="user.image" :alt="user?.name" />
                <AvatarFallback class="ginko:rounded-lg">
                  {{ initials }}
                </AvatarFallback>
              </Avatar>
              <div
                class="ginko:grid ginko:flex-1 ginko:text-left ginko:text-sm ginko:leading-tight"
              >
                <span class="ginko:truncate ginko:font-semibold">{{ user?.name ?? 'User' }}</span>
                <span class="ginko:truncate ginko:text-xs">{{ user?.email }}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="cycleColorMode">
            <Icon :name="colorModeIcon" class="ginko:mr-2 ginko:size-4" />
            {{ colorModeLabel }}
          </DropdownMenuItem>
          <DropdownMenuItem @click="router.push(`${studioRoute}/settings`)">
            <Icon
              :name="currentStudioLocale?.flag ?? 'lucide:globe'"
              class="ginko:mr-2 ginko:size-4"
            />
            {{ t('ginkoCms.studio.userMenu.language') }}:
            {{ currentStudioLocale?.label ?? currentLocale.toUpperCase() }}
          </DropdownMenuItem>
          <template v-if="authEnabled">
            <DropdownMenuItem @click="copyUserId">
              <Icon
                :name="copiedId ? 'lucide:check' : 'lucide:copy'"
                class="ginko:mr-2 ginko:size-4"
              />
              {{
                copiedId
                  ? t('ginkoCms.studio.userMenu.copied')
                  : t('ginkoCms.studio.userMenu.copyUserId')
              }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="handleSignOut">
              <LogOut class="ginko:mr-2 ginko:size-4" />
              {{ t('ginkoCms.auth.session.signOut') }}
            </DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
