import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'ginko:inline-flex ginko:items-center ginko:justify-center ginko:rounded-md ginko:border ginko:px-2 ginko:py-0.5 ginko:text-xs ginko:font-medium ginko:w-fit ginko:whitespace-nowrap ginko:shrink-0 ginko:[&>svg]:size-3 ginko:gap-1 ginko:[&>svg]:pointer-events-none ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:focus-visible:ring-[3px] ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40 ginko:aria-invalid:border-destructive ginko:transition-colors ginko:overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'ginko:border-transparent ginko:bg-primary ginko:text-primary-foreground ginko:[a&]:hover:bg-primary/90',
        secondary:
          'ginko:border-transparent ginko:bg-secondary ginko:text-secondary-foreground ginko:[a&]:hover:bg-secondary/90',
        destructive:
          'ginko:border-transparent ginko:bg-destructive ginko:text-white ginko:[a&]:hover:bg-destructive/90 ginko:focus-visible:ring-destructive/20 ginko:dark:focus-visible:ring-destructive/40 ginko:dark:bg-destructive/60',
        success:
          'ginko:border-transparent ginko:bg-success/12 ginko:text-success-fg ginko:[a&]:hover:bg-success/20 ginko:dark:bg-success/20 ginko:dark:text-success-fg',
        warning:
          'ginko:border-transparent ginko:bg-warning/15 ginko:text-warning-fg ginko:[a&]:hover:bg-warning/25 ginko:dark:bg-warning/20 ginko:dark:text-warning-fg',
        outline:
          'ginko:text-foreground ginko:[a&]:hover:bg-accent ginko:[a&]:hover:text-accent-foreground',
        soft: 'ginko:border-transparent ginko:bg-muted ginko:text-muted-foreground ginko:[a&]:hover:bg-muted/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
