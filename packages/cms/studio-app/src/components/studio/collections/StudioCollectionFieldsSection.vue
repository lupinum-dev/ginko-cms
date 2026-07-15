<script setup lang="ts">
import { List } from '@lucide/vue'
import { computed } from 'vue'

type FieldItem = {
  key: string
  type: string
  label?: string | Record<string, string> | null
  description?: string | null
  required?: boolean
  localized?: boolean
  hidden?: boolean
  searchable?: boolean
  sortable?: boolean
  width?: string
  options?: string[] | null
  relation?: { collectionId: string; multiple?: boolean } | null
  validation?: Record<string, unknown> | null
}

const props = defineProps<{
  collectionFields: FieldItem[]
  defaultLocale: string
  t: (key: string, params?: Record<string, unknown>) => string
}>()

const selectedFieldKey = defineModel<string | null>('selectedFieldKey', {
  required: true,
})

function resolveLabel(field: FieldItem) {
  if (!field.label) return field.key
  if (typeof field.label === 'string') return field.label
  return (
    field.label[props.defaultLocale] ?? field.label[Object.keys(field.label)[0] ?? ''] ?? field.key
  )
}

const selectedField = computed(
  () => props.collectionFields.find((field) => field.key === selectedFieldKey.value) ?? null,
)

const selectedFieldBadges = computed(() => {
  const field = selectedField.value
  if (!field) return []
  return [
    field.required ? 'required' : null,
    field.localized ? 'localized' : null,
    field.searchable ? 'searchable' : null,
    field.sortable ? 'sortable' : null,
    field.hidden ? 'ginko:hidden' : null,
    field.width === 'half' ? props.t('ginkoCms.studio.collectionsPage.widthHalfLabel') : null,
  ].filter((badge): badge is string => typeof badge === 'string')
})
</script>

<template>
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-56 ginko:md:shrink-0">
      <h2
        class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground"
      >
        <List class="ginko:size-4 ginko:text-muted-foreground" />
        {{ t('ginkoCms.common.fields') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{
          t('ginkoCms.studio.collectionsPage.fieldsCount', {
            count: collectionFields.length,
          })
        }}
      </p>
    </div>
    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-3">
      <!-- Field list -->
      <StudioEmptyState
        v-if="collectionFields.length === 0"
        :title="t('ginkoCms.studio.collectionsPage.noFields')"
      >
        <template #icon>
          <List class="ginko:size-5" aria-hidden="true" />
        </template>
      </StudioEmptyState>

      <div v-else class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          v-for="field in collectionFields"
          :key="field.key"
          class="ginko:group ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3 ginko:cursor-pointer ginko:transition-colors ginko:hover:bg-muted/30"
          :class="selectedFieldKey === field.key ? 'ginko:bg-muted/50' : ''"
          :data-testid="`cms-field-row-${field.key}`"
          @click="selectedFieldKey = field.key"
        >
          <div class="ginko:flex ginko:items-center ginko:gap-3 ginko:min-w-0">
            <span class="ginko:text-sm ginko:font-medium ginko:truncate">{{
              resolveLabel(field)
            }}</span>
            <code
              class="ginko:text-xs ginko:font-mono ginko:text-muted-foreground ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:rounded ginko:shrink-0"
              >{{ field.type }}</code
            >
            <span v-if="field.required" class="ginko:text-xs ginko:text-destructive ginko:shrink-0"
              >*</span
            >
            <span v-if="field.width === 'half'" class="ginko:text-xs ginko:text-muted-foreground">{{
              t('ginkoCms.studio.collectionsPage.widthHalfLabel')
            }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="selectedField"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-4"
      >
        <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
          <div class="ginko:min-w-0">
            <h3 class="studio-text-label ginko:truncate">
              {{ resolveLabel(selectedField) }}
            </h3>
            <p class="ginko:mt-1 ginko:font-mono ginko:text-xs ginko:text-muted-foreground">
              {{ selectedField.key }} · {{ selectedField.type }}
            </p>
          </div>
          <div class="ginko:flex ginko:flex-wrap ginko:gap-1.5">
            <Badge
              v-for="badge in selectedFieldBadges"
              :key="badge"
              variant="outline"
              class="ginko:text-xs"
            >
              {{ badge }}
            </Badge>
          </div>
        </div>
        <p
          v-if="selectedField.description"
          class="ginko:mt-3 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground"
        >
          {{ selectedField.description }}
        </p>
        <dl class="ginko:mt-3 ginko:grid ginko:gap-2 ginko:text-xs ginko:sm:grid-cols-2">
          <div class="ginko:rounded-md ginko:bg-background ginko:px-2 ginko:py-1.5">
            <dt class="ginko:text-muted-foreground">Layout</dt>
            <dd class="ginko:mt-0.5 ginko:text-foreground">{{ selectedField.width ?? 'full' }}</dd>
          </div>
          <div class="ginko:rounded-md ginko:bg-background ginko:px-2 ginko:py-1.5">
            <dt class="ginko:text-muted-foreground">Validation</dt>
            <dd class="ginko:mt-0.5 ginko:text-foreground">
              {{ selectedField.validation ? 'custom rules' : 'type defaults' }}
            </dd>
          </div>
          <div
            v-if="selectedField.relation"
            class="ginko:rounded-md ginko:bg-background ginko:px-2 ginko:py-1.5"
          >
            <dt class="ginko:text-muted-foreground">Relation</dt>
            <dd class="ginko:mt-0.5 ginko:text-foreground">
              {{ selectedField.relation.collectionId }}
              {{ selectedField.relation.multiple ? '(many)' : '(one)' }}
            </dd>
          </div>
          <div
            v-if="selectedField.options?.length"
            class="ginko:rounded-md ginko:bg-background ginko:px-2 ginko:py-1.5"
          >
            <dt class="ginko:text-muted-foreground">Options</dt>
            <dd class="ginko:mt-0.5 ginko:truncate ginko:text-foreground">
              {{ selectedField.options.join(', ') }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
