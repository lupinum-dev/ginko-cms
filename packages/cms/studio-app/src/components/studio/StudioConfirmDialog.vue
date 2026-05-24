<script setup lang="ts">
import { useCmsI18n } from '../../composables/useCmsI18n'
const props = defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'default' | 'destructive'
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
const { t } = useCmsI18n()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="ginko:sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ props.title }}</DialogTitle>
        <DialogDescription v-if="props.description">
          {{ props.description }}
        </DialogDescription>
      </DialogHeader>

      <div class="ginko:space-y-4">
        <slot />
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">
          {{ props.cancelLabel ?? t('ginkoCms.studio.confirmDialog.cancel') }}
        </Button>
        <Button
          :variant="props.confirmVariant ?? 'destructive'"
          data-testid="cms-confirm-dialog-confirm"
          @click="emit('confirm')"
        >
          {{ props.confirmLabel ?? t('ginkoCms.studio.confirmDialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
