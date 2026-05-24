import { evaluateFieldCondition as evaluateSharedFieldCondition } from '@lupinum/ginko-cms-contract/shared/fields/conditions.js'
import { describe, expect, it } from 'vitest'

import {
  evaluateFieldCondition,
  getClientValidationErrors,
} from '#ginko-cms-public/utils/cmsFields'

describe('runtime cmsFields', () => {
  it('reuses the shared field condition evaluator', () => {
    expect(evaluateFieldCondition).toBe(evaluateSharedFieldCondition)
  })

  it('uses translated client validation messages when provided', () => {
    const fields = [{ key: 'summary', type: 'text', label: 'Summary', required: true }]
    const t = (key: string, params?: Record<string, unknown>, defaultValue?: string) => {
      if (key === 'ginkoCms.studio.collectionEditor.validationTitleRequired')
        return 'Titel ist erforderlich'
      if (key === 'ginkoCms.studio.collectionEditor.validationFieldRequired')
        return `${params?.field} ist erforderlich`
      return defaultValue ?? key
    }

    const errors = getClientValidationErrors(fields, { summary: '' }, t)

    expect(errors).toEqual([{ field: 'summary', message: 'Summary ist erforderlich' }])
  })
})
