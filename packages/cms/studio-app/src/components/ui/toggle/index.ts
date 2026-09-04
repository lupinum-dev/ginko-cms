import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Toggle } from './Toggle.vue'

export const toggleVariants = cva(
  "ginko:inline-flex ginko:items-center ginko:justify-center ginko:gap-2 ginko:rounded-md ginko:text-sm ginko:font-medium ginko:hover:bg-muted ginko:hover:text-muted-foreground ginko:disabled:pointer-events-none ginko:disabled:opacity-50 ginko:data-[state=on]:bg-accent ginko:data-[state=on]:text-accent-foreground ginko:[&_svg]:pointer-events-none ginko:[&_svg:not([class*='size-'])]:size-4 ginko:[&_svg]:shrink-0 ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:focus-visible:ring-[3px] ginko:outline-none ginko:transition-[color,box-shadow] ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40 ginko:aria-invalid:border-destructive ginko:whitespace-nowrap",
  {
    variants: {
      variant: {
        default: 'ginko:bg-transparent',
        outline:
          'ginko:border ginko:border-input ginko:bg-transparent ginko:shadow-xs ginko:hover:bg-accent ginko:hover:text-accent-foreground',
      },
      size: {
        default: 'ginko:h-9 ginko:px-2 ginko:min-w-9',
        sm: 'ginko:h-8 ginko:px-1.5 ginko:min-w-8',
        lg: 'ginko:h-10 ginko:px-2.5 ginko:min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ToggleVariants = VariantProps<typeof toggleVariants>
