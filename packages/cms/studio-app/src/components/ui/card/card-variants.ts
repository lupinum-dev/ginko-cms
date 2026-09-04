import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export const cardVariants = cva(
  'ginko:group/card ginko:bg-card ginko:text-card-foreground ginko:text-sm ginko:ring-1 ginko:ring-foreground/10 ginko:shadow-none',
  {
    variants: {
      variant: {
        default:
          'ginko:flex ginko:flex-col ginko:gap-(--card-spacing) ginko:overflow-hidden ginko:rounded-xl ginko:py-(--card-spacing) ginko:has-data-[slot=card-footer]:pb-0',
        fieldGroup:
          'ginko:not-prose ginko:my-5 ginko:flex ginko:flex-col ginko:gap-0 ginko:overflow-hidden ginko:rounded-lg ginko:py-0',
        field:
          'ginko:not-prose ginko:my-5 ginko:flex ginko:flex-col ginko:gap-0 ginko:rounded-lg ginko:py-0',
        fieldRow:
          'ginko:flex ginko:flex-col ginko:gap-0 ginko:rounded-none ginko:border-0 ginko:bg-transparent ginko:py-0 ginko:shadow-none ginko:ring-0 ginko:outline-none',
      },
      size: {
        default: 'ginko:[--card-spacing:--spacing(4)]',
        sm: 'ginko:[--card-spacing:--spacing(3)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type CardVariants = VariantProps<typeof cardVariants>
