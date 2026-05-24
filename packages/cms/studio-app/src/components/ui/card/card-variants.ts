import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export const cardVariants = cva(
  'ginko:bg-card ginko:text-card-foreground ginko:border ginko:border-border/40',
  {
    variants: {
      variant: {
        default: 'ginko:flex ginko:flex-col ginko:rounded-xl',
        fieldGroup:
          'not-prose ginko:my-5 ginko:flex ginko:flex-col ginko:gap-0 ginko:overflow-hidden ginko:rounded-lg ginko:py-0',
        field:
          'not-prose ginko:my-5 ginko:flex ginko:flex-col ginko:gap-0 ginko:rounded-lg ginko:py-0',
        fieldRow:
          'ginko:flex ginko:flex-col ginko:gap-0 ginko:rounded-none ginko:border-0 ginko:bg-transparent ginko:py-0 ginko:shadow-none ginko:ring-0 ginko:outline-none',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type CardVariants = VariantProps<typeof cardVariants>
