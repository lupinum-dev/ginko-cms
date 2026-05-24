import type { FieldType } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'

import FieldArray from './FieldArray.vue'
import FieldAsset from './FieldAsset.vue'
import FieldBlocks from './FieldBlocks.vue'
import FieldCheckbox from './FieldCheckbox.vue'
import FieldCode from './FieldCode.vue'
import FieldColor from './FieldColor.vue'
import FieldDate from './FieldDate.vue'
import FieldDivider from './FieldDivider.vue'
import FieldIcon from './FieldIcon.vue'
import FieldImages from './FieldImages.vue'
import FieldJson from './FieldJson.vue'
import FieldMultiselect from './FieldMultiselect.vue'
import FieldNumber from './FieldNumber.vue'
import FieldObject from './FieldObject.vue'
import FieldRadio from './FieldRadio.vue'
import FieldRange from './FieldRange.vue'
import FieldRelation from './FieldRelation.vue'
import FieldRelations from './FieldRelations.vue'
import FieldSection from './FieldSection.vue'
import FieldSelect from './FieldSelect.vue'
import FieldText from './FieldText.vue'
import FieldTextarea from './FieldTextarea.vue'
import FieldToggle from './FieldToggle.vue'

export const fieldComponents = {
  divider: FieldDivider,
  section: FieldSection,
  text: FieldText,
  slug: FieldText,
  email: FieldText,
  url: FieldText,
  textarea: FieldTextarea,
  richtext: defineAsyncComponent(() => import('./FieldRichtext.vue')),
  number: FieldNumber,
  range: FieldRange,
  select: FieldSelect,
  radio: FieldRadio,
  multiselect: FieldMultiselect,
  checkbox: FieldCheckbox,
  toggle: FieldToggle,
  date: FieldDate,
  datetime: FieldDate,
  time: FieldDate,
  image: FieldAsset,
  file: FieldAsset,
  images: FieldImages,
  code: FieldCode,
  color: FieldColor,
  icon: FieldIcon,
  json: FieldJson,
  object: FieldObject,
  array: FieldArray,
  blocks: FieldBlocks,
  relation: FieldRelation,
  relations: FieldRelations,
} satisfies Record<FieldType, Component>

export {
  formatLabel,
  getDefault,
  createDefaultRecord,
  getClientFieldError,
  getConditionHint,
} from './useFieldCommon'
export type { FieldDefinition, FieldProps } from './useFieldCommon'
