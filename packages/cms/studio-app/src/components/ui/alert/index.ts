import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Alert } from './Alert.vue'
export { default as AlertDescription } from './AlertDescription.vue'
export { default as AlertTitle } from './AlertTitle.vue'

export const alertVariants = cva(
  'ginko:relative ginko:grid ginko:w-full ginko:grid-cols-[0_1fr] ginko:items-start ginko:gap-y-0.5 ginko:rounded-lg ginko:border ginko:px-4 ginko:py-3 ginko:text-sm ginko:has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] ginko:has-[>svg]:gap-x-3 ginko:[&>svg]:size-4 ginko:[&>svg]:translate-y-0.5 ginko:[&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'ginko:bg-card ginko:text-card-foreground',
        destructive:
          'ginko:border-destructive/40 ginko:bg-destructive/5 ginko:text-destructive-fg ginko:[&>svg]:text-destructive-fg ginko:*:data-[slot=alert-description]:text-destructive-fg/90',
        success:
          'ginko:border-success/40 ginko:bg-success/10 ginko:text-success-fg ginko:[&>svg]:text-success-fg ginko:*:data-[slot=alert-description]:text-foreground/85 ginko:dark:bg-success/15',
        warning:
          'ginko:border-warning/40 ginko:bg-warning/10 ginko:text-warning-fg ginko:[&>svg]:text-warning-fg ginko:*:data-[slot=alert-description]:text-foreground/85 ginko:dark:bg-warning/15',
        info: 'ginko:border-primary/30 ginko:bg-primary/5 ginko:text-foreground ginko:[&>svg]:text-primary ginko:*:data-[slot=alert-description]:text-foreground/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)
export type AlertVariants = VariantProps<typeof alertVariants>
