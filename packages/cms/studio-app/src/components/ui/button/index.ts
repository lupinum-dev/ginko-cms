import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  "studio-motion-fast ginko:inline-flex ginko:shrink-0 ginko:items-center ginko:justify-center ginko:gap-1.5 ginko:whitespace-nowrap ginko:rounded-lg ginko:border ginko:border-transparent ginko:bg-clip-padding ginko:text-sm ginko:font-medium ginko:outline-none ginko:select-none ginko:active:translate-y-px ginko:disabled:pointer-events-none ginko:disabled:opacity-50 ginko:[&_svg]:pointer-events-none ginko:[&_svg]:shrink-0 ginko:[&_svg:not([class*='size-'])]:size-4 ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:focus-visible:ring-[3px] ginko:aria-invalid:border-destructive ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          'ginko:bg-primary ginko:text-primary-foreground ginko:hover:bg-primary/90 ginko:focus-visible:ring-offset-1 ginko:focus-visible:ring-offset-background',
        destructive:
          'ginko:bg-destructive/10 ginko:text-destructive-fg ginko:hover:bg-destructive/15 ginko:focus-visible:border-destructive/40 ginko:focus-visible:ring-destructive/20 ginko:dark:bg-destructive/20 ginko:dark:hover:bg-destructive/30 ginko:dark:focus-visible:ring-destructive/40',
        outline:
          'ginko:border-border ginko:bg-background ginko:hover:bg-muted ginko:hover:text-foreground ginko:aria-expanded:bg-muted ginko:aria-expanded:text-foreground ginko:dark:border-input ginko:dark:bg-input/30 ginko:dark:hover:bg-input/50',
        secondary:
          'ginko:bg-secondary ginko:text-secondary-foreground ginko:hover:bg-secondary/80 ginko:aria-expanded:bg-secondary ginko:aria-expanded:text-secondary-foreground',
        ghost:
          'ginko:hover:bg-muted ginko:hover:text-foreground ginko:aria-expanded:bg-muted ginko:aria-expanded:text-foreground ginko:dark:hover:bg-muted/50',
        link: 'ginko:text-primary ginko:underline-offset-4 ginko:hover:underline',
      },
      size: {
        default: 'ginko:h-8 ginko:px-2.5 ginko:has-[>svg]:px-2.5',
        sm: 'ginko:h-7 ginko:px-2.5 ginko:text-xs ginko:has-[>svg]:px-2',
        lg: 'ginko:h-9 ginko:px-3.5 ginko:has-[>svg]:px-3',
        icon: 'ginko:size-8',
        'icon-sm': 'ginko:size-7',
        'icon-lg': 'ginko:size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
