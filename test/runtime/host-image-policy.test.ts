// @vitest-environment jsdom
import {
  parseMdcBody,
  validatePublicMarkdownAst,
  validateStoredPortableMarkdownAst,
} from '@lupinum/ginko-content/cms-contract'
import {
  collectStoredMdcAssetReferences,
  rewriteStoredMdcAssetReferences,
} from '@lupinum/ginko-content/portability'
import { createAuthoringKit } from '@lupinum/ginko-editor'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ContentImage from '../../playground/app/components/ContentImage.vue'
import { imageAuthoring } from '../../playground/image-authoring'

const source = `::image
---
id: stored-image
filename: canopy.png
src: stored-image
alt: Forest canopy
title: Looking up
width: 960
height: 640
---
::`

describe('host rich text image contract', () => {
  it.each(['frontmatter', 'props-fence'])(
    'preserves Editor metadata using %s while resolving only the registered media source',
    async (dialect) => {
      const input =
        dialect === 'frontmatter'
          ? source
          : source.replace('---', '```yaml [props]').replace('---', '```')
      await expect(createAuthoringKit(imageAuthoring)).resolves.toBeDefined()
      const stored = await parseMdcBody(input)
      expect(validateStoredPortableMarkdownAst(stored.body, imageAuthoring.policy).ok).toBe(true)
      expect(await collectStoredMdcAssetReferences(input, imageAuthoring.policy)).toEqual([
        'stored-image',
      ])
      const rewritten = await rewriteStoredMdcAssetReferences(
        input,
        imageAuthoring.policy,
        () => 'https://cdn.example.com/canopy.png',
      )
      const body = (await parseMdcBody(rewritten)).body
      expect(validatePublicMarkdownAst(body, imageAuthoring.policy).ok).toBe(true)
      expect(JSON.stringify(body)).toContain('Forest canopy')
      expect(JSON.stringify(body)).toContain('stored-image')
      expect(JSON.stringify(body)).toContain('canopy.png')
      const unsafe = await parseMdcBody(source.replace('width: 960', 'onclick: alert(1)'))
      expect(validateStoredPortableMarkdownAst(unsafe.body, imageAuthoring.policy).ok).toBe(false)
      const arbitrary = await parseMdcBody(source.replaceAll('::image', '::arbitrary'))
      expect(validateStoredPortableMarkdownAst(arbitrary.body, imageAuthoring.policy).ok).toBe(
        false,
      )
    },
  )

  it('renders alt and dimensions without forwarding metadata or arbitrary attributes', async () => {
    const wrapper = mount(ContentImage, {
      props: {
        src: 'https://cdn.example.com/image.png',
        alt: 'Forest canopy',
        id: 'stored-image',
        filename: 'canopy.png',
        width: 960,
        height: 640,
      },
      attrs: { onerror: 'alert(1)', style: 'display:none' },
    })
    expect(wrapper.get('img').attributes()).toMatchObject({
      src: 'https://cdn.example.com/image.png',
      alt: 'Forest canopy',
      width: '960',
      height: '640',
    })
    for (const key of ['id', 'filename', 'onerror', 'style'])
      expect(wrapper.get('img').attributes(key)).toBeUndefined()
    await wrapper.setProps({ width: '960', height: '640' })
    expect(wrapper.get('img').attributes('width')).toBe('960')
    await wrapper.setProps({ width: 'expression(alert(1))', height: '-1' })
    expect(wrapper.get('img').attributes('width')).toBeUndefined()
    expect(wrapper.get('img').attributes('height')).toBeUndefined()
    await wrapper.setProps({ src: 'javascript:alert(1)' })
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })
})
