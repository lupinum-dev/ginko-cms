import { decodeContentBodyAstJson } from '@lupinum/ginko-cms-contract/shared/publicContent.js'
import { convexToJson } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { toGinkoEntry, type PublicProjectionEntry } from '#component/publicReadAdapter'

import { decodeCmsBodyTransport } from '../../packages/cms/src/nuxt-provider/body-transport'

const entry: PublicProjectionEntry = {
  _id: 'entry',
  collection: 'posts',
  slug: 'garden',
  path: '/posts/garden',
  href: '/posts/garden',
  locale: 'en',
  resolvedLocale: 'en',
  title: 'Garden',
  data: {},
  publishedAt: 1,
  stableId: 'garden',
  assetFacts: [],
}

describe('article JSON transport boundary', () => {
  it('keeps existing native article and null structured body wire values unchanged', () => {
    for (const bodyAst of [null, { type: 'root', children: [{ type: 'text', value: 'Garden' }] }]) {
      const wire = toGinkoEntry({ ...entry, bodyAst }, 'en')
      expect(wire.bodyAst).toEqual(bodyAst)
      expect(wire).not.toHaveProperty('bodyAstJson')
      expect(() => convexToJson(wire)).not.toThrow()
    }
  })

  it('preserves parser markers without interpreting similarly named user fields', () => {
    const bodyAst = {
      type: 'root',
      children: [{ type: 'element', tag: 'image', props: { $: ['src'], src: 'asset' } }],
    }
    const data = {
      bodyAstJson: 'ordinary user text',
      nested: { bodyAstJson: 'another user value' },
    }
    const encoded = toGinkoEntry({ ...entry, data, bodyAst }, 'en')
    const envelope = { protocol: 'ginko-content-cms/v1', result: { page: encoded } }
    expect(decodeCmsBodyTransport('page', envelope)).toEqual({
      ...envelope,
      result: { page: { ...encoded, bodyAstJson: undefined, bodyAst } },
    })
    expect(decodeContentBodyAstJson(encoded.bodyAstJson!)).toEqual(bodyAst)
    expect(decodeCmsBodyTransport('siteData', { result: { values: data } })).toEqual({
      result: { values: data },
    })
  })

  it('rejects ambiguous, malformed and non-root transport payloads', () => {
    for (const page of [
      { bodyAst: null, bodyAstJson: '{"type":"root","children":[]}' },
      { bodyAstJson: null },
      { bodyAstJson: 'broken' },
      { bodyAstJson: '{"type":"text","value":"not a root"}' },
      { bodyAstJson: '{"type":"root","children":[],"bad":1e999}' },
    ])
      expect(() => decodeCmsBodyTransport('page', { result: { page } })).toThrow(
        /CMS_BODY_AST_INVALID/,
      )
    expect(decodeContentBodyAstJson(null)).toBeNull()
  })
})
