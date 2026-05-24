import { buildCmsFieldData, getClientValidationErrors } from '@public/utils/cmsFields'
import { describe, expect, it } from 'vitest'

describe('public CMS field helpers', () => {
  it('removes empty nested optional values before saving draft data', () => {
    const fields = [
      {
        key: 'avatar',
        type: 'object',
        fields: [
          { key: 'src', type: 'image', required: true },
          { key: 'loading', type: 'select', options: ['lazy', 'eager'] },
          { key: 'alt', type: 'text' },
        ],
      },
    ]

    expect(
      buildCmsFieldData(fields, {
        avatar: {
          src: 'asset_123',
          loading: '',
          alt: '',
        },
      }),
    ).toEqual({
      avatar: {
        src: 'asset_123',
      },
    })
  })

  it('reports unsupported select values before publish reaches backend schema validation', () => {
    const fields = [{ key: 'loading', type: 'select', options: ['lazy', 'eager'] }]

    expect(getClientValidationErrors(fields, { loading: 'Loading' })).toEqual([
      {
        field: 'loading',
        message: 'Loading must be one of the configured options.',
      },
    ])
  })
})
