<script setup lang="ts">
import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'

const editor = useStudioEntryEditorContext()
</script>

<template>
  <StudioConfirmDialog
    :open="editor.history.showCheckpointDialog"
    :title="editor.loader.t('ginkoCms.studio.collectionEditor.checkpointDialogTitle')"
    :description="editor.loader.t('ginkoCms.studio.collectionEditor.checkpointDialogDescription')"
    :confirm-label="editor.loader.t('ginkoCms.studio.collectionEditor.confirmCheckpoint')"
    confirm-variant="default"
    @update:open="editor.history.showCheckpointDialog = $event"
    @confirm="editor.history.handleCreateCheckpoint()"
  >
    <div class="ginko:space-y-2">
      <Label for="checkpoint-message" class="ginko:text-xs ginko:text-muted-foreground">
        {{ editor.loader.t('ginkoCms.studio.collectionEditor.checkpointMessageLabel') }}
      </Label>
      <Textarea
        id="checkpoint-message"
        v-model="editor.history.checkpointMessage"
        :placeholder="
          editor.loader.t('ginkoCms.studio.collectionEditor.checkpointMessagePlaceholder')
        "
        class="ginko:min-h-[80px] ginko:text-sm"
      />
      <p
        v-if="editor.history.checkpointMessage.trim() === ''"
        class="ginko:text-xs ginko:text-muted-foreground"
      >
        {{ editor.loader.t('ginkoCms.studio.collectionEditor.checkpointMessageRequired') }}
      </p>
    </div>
  </StudioConfirmDialog>
</template>
