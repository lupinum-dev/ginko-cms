import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export const fieldVariants = cva(
  'ginko:group/field ginko:flex ginko:w-full ginko:gap-3 ginko:data-[invalid=true]:text-destructive',
  {
    variants: {
      orientation: {
        vertical: ['ginko:flex-col ginko:[&>*]:w-full ginko:[&>.sr-only]:w-auto'],
        horizontal: [
          'ginko:flex-row ginko:items-center',
          'ginko:[&>[data-slot=field-label]]:flex-auto',
          'ginko:has-[>[data-slot=field-content]]:items-start ginko:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        ],
        responsive: [
          'ginko:flex-col ginko:[&>*]:w-full ginko:[&>.sr-only]:w-auto ginko:@md/field-group:flex-row ginko:@md/field-group:items-center ginko:@md/field-group:[&>*]:w-auto',
          'ginko:@md/field-group:[&>[data-slot=field-label]]:flex-auto',
          'ginko:@md/field-group:has-[>[data-slot=field-content]]:items-start ginko:@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        ],
      },
    },
    defaultVariants: {
      orientation: 'vertical',
    },
  },
)

export type FieldVariants = VariantProps<typeof fieldVariants>

export { default as Field } from './Field.vue'
export { default as FieldContent } from './FieldContent.vue'
export { default as FieldDescription } from './FieldDescription.vue'
export { default as FieldError } from './FieldError.vue'
export { default as FieldGroup } from './FieldGroup.vue'
export { default as FieldLabel } from './FieldLabel.vue'
export { default as FieldLegend } from './FieldLegend.vue'
export { default as FieldSeparator } from './FieldSeparator.vue'
export { default as FieldSet } from './FieldSet.vue'
export { default as FieldTitle } from './FieldTitle.vue'
