import { applyContentAssetFacts } from '@lupinum/ginko-cms-contract/shared/publicContent.js'
import { describe, expect, it } from 'vitest'

describe('content asset projection', () => {
  it('resolves only exact fields without changing metadata or canonical source', () => {
    const data = { hero: 'asset-1', caption: 'asset-1' }
    const bodyAst = { children: [{ props: { id: 'asset-1', src: 'asset-1', alt: 'Forest' } }] }
    const result = applyContentAssetFacts({
      data,
      bodyAst,
      assetFacts: [
        { assetId: 'asset-1', fieldPath: 'data.hero', url: 'https://example.test/image.png' },
        {
          assetId: 'asset-1',
          fieldPath: 'bodyAst.children[0].props.src',
          url: 'https://example.test/image.png',
        },
      ],
    })
    expect(result.data).toEqual({ hero: 'https://example.test/image.png', caption: 'asset-1' })
    expect(result.bodyAst.children[0]?.props).toEqual({
      src: 'https://example.test/image.png',
      id: 'asset-1',
      alt: 'Forest',
    })
    expect(data.hero).toBe('asset-1')
    expect(bodyAst.children[0]?.props.src).toBe('asset-1')
  })
  it.each(['data.missing', 'data.hero.extra', 'data.__proto__.src', 'data.hero/garbage'])(
    'rejects invalid paths %s',
    (fieldPath) => {
      expect(() =>
        applyContentAssetFacts({
          data: { hero: 'asset-1' },
          bodyAst: null,
          assetFacts: [{ assetId: 'asset-1', fieldPath, url: 'https://example.test/image.png' }],
        }),
      ).toThrow()
    },
  )
  it('rejects facts for another identity', () => {
    expect(() =>
      applyContentAssetFacts({
        data: { hero: 'asset-2' },
        bodyAst: undefined,
        assetFacts: [
          { assetId: 'asset-1', fieldPath: 'data.hero', url: 'https://example.test/image.png' },
        ],
      }),
    ).toThrow('identity')
  })
})
