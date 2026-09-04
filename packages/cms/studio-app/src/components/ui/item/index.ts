import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Item } from './Item.vue'
export { default as ItemActions } from './ItemActions.vue'
export { default as ItemContent } from './ItemContent.vue'
export { default as ItemDescription } from './ItemDescription.vue'
export { default as ItemGroup } from './ItemGroup.vue'
export { default as ItemMedia } from './ItemMedia.vue'
export { default as ItemSeparator } from './ItemSeparator.vue'
export { default as ItemTitle } from './ItemTitle.vue'

export const itemVariants = cva(
  'ginko:group/item ginko:flex ginko:w-full ginko:min-w-0 ginko:flex-wrap ginko:items-center ginko:transition-colors ginko:duration-100 ginko:outline-none ginko:focus-visible:border-ring ginko:focus-visible:ring-[3px] ginko:focus-visible:ring-ring/50 ginko:[a]:transition-colors',
  {
    variants: {
      variant: {
        default: 'ginko:bg-transparent',
        outline: 'ginko:rounded-lg ginko:border ginko:border-border ginko:bg-background',
        muted: 'ginko:rounded-lg ginko:bg-muted/50',
      },
      size: {
        default: 'ginko:gap-4 ginko:p-4',
        sm: 'ginko:gap-3 ginko:p-3',
        xs: 'ginko:gap-2 ginko:p-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ItemVariants = VariantProps<typeof itemVariants>
