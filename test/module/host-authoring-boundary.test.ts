import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { loadContentConfig } from '../../packages/cms/src/cli/push'
import {
  projectCmsPresentation,
  projectContractCollections,
} from '../../packages/cms/src/module/content-contract'
import { buildPublicRuntimeCollections } from '../../packages/cms/src/module/runtime-config'
import { imageAuthoring } from '../../playground/image-authoring'

const contract = buildResolvedContentContract(
  {
    collections: {
      blog: { type: 'page', source: 'content/blog/**/*.md', route: '/blog', i18n: true },
    },
  },
  { defaultLocale: 'en', locales: ['en'], componentPolicy: imageAuthoring.policy },
)

describe('host authoring boundary', () => {
  it('keeps null policy values intact across Nuxt runtime configuration normalization', () => {
    const collections = projectContractCollections(contract, {
      collections: { blog: { authoring: JSON.parse(JSON.stringify(imageAuthoring)) } },
    })
    const runtime = buildPublicRuntimeCollections(
      {
        route: '/studio',
        collections,
        defaultLocale: 'en',
        locales: [{ code: 'en', isDefault: true }],
      },
      { defaultLocale: 'en', locales: [{ code: 'en', isDefault: true }] },
    )
    const normalized = JSON.parse(
      JSON.stringify(runtime, (_key, value) => (value === null ? '' : value)),
    )
    expect(typeof normalized.blog.settings.authoring).toBe('string')
    expect(JSON.parse(normalized.blog.settings.authoring)).toEqual(imageAuthoring)
  })

  it('keeps host-only authoring out of presentation hashes and preserves label changes', async () => {
    const empty = projectCmsPresentation({ collections: {} })
    const authoringOnly = projectCmsPresentation({
      collections: { blog: { authoring: JSON.parse(JSON.stringify(imageAuthoring)) } },
    })
    expect(authoringOnly).toEqual(empty)
    expect(
      projectCmsPresentation({
        collections: {
          blog: { fields: {}, authoring: JSON.parse(JSON.stringify(imageAuthoring)) },
        },
      }),
    ).toEqual({ collections: { blog: { fields: {} } } })
    const legacy = { collections: { blog: { label: 'Articles', fields: {} }, empty: {} } }
    expect(projectCmsPresentation(legacy)).toEqual(legacy)
    expect(await hashCanonicalJson(projectCmsPresentation(legacy))).toBe(
      await hashCanonicalJson(legacy),
    )
    expect(await hashCanonicalJson(authoringOnly)).toBe(await hashCanonicalJson(empty))
    const first = {
      collections: {
        blog: {
          label: 'Articles',
          fields: { title: { label: 'Headline' } },
          authoring: JSON.parse(JSON.stringify(imageAuthoring)),
        },
      },
    }
    const changedKit = structuredClone(first)
    changedKit.collections.blog.authoring.implementation.image.componentName = 'NewHostImage'
    expect(await hashCanonicalJson(projectCmsPresentation(first))).toBe(
      await hashCanonicalJson(projectCmsPresentation(changedKit)),
    )
    changedKit.collections.blog.label = 'Journal'
    expect(await hashCanonicalJson(projectCmsPresentation(first))).not.toBe(
      await hashCanonicalJson(projectCmsPresentation(changedKit)),
    )
    expect(projectCmsPresentation(first)).toEqual({
      collections: { blog: { label: 'Articles', fields: { title: { label: 'Headline' } } } },
    })
  })

  it('uses the same projection in the CLI and keeps the complete kit in host runtime collections', async () => {
    const layout = {
      collections: {
        blog: { label: 'Articles', authoring: JSON.parse(JSON.stringify(imageAuthoring)) },
      },
    }
    const root = mkdtempSync(join(tmpdir(), 'ginko-authoring-'))
    try {
      writeFileSync(
        join(root, 'nuxt.config.ts'),
        `export default ${JSON.stringify({ ginkoCms: { editorialLayout: layout } })}`,
      )
      const cli = await loadContentConfig(root)
      expect(cli.presentation).toEqual(projectCmsPresentation(layout))
      expect(await hashCanonicalJson(cli.presentation)).toBe(
        await hashCanonicalJson(projectCmsPresentation(layout)),
      )
      expect(projectContractCollections(contract, layout).blog?.settings).toMatchObject({
        authoring: imageAuthoring,
        componentPolicy: imageAuthoring.policy,
      })
      layout.collections.blog.authoring.policy.components.image.props.src.required = false
      expect(() => projectContractCollections(contract, layout)).toThrow('must exactly match')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
