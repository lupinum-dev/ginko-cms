import { describe, expect, it } from 'vitest'

import {
  ginkoCmsBridgeManifest,
  renderAuthConfig,
  renderConvexConfig,
  renderSchema,
} from '../../packages/cms/src/module/bridge-manifest.js'

describe('ginko-cms bridge manifest', () => {
  it('exports the secret-gated collection installer host actions', async () => {
    const files =
      typeof ginkoCmsBridgeManifest.modules === 'function'
        ? await ginkoCmsBridgeManifest.modules()
        : (ginkoCmsBridgeManifest.modules ?? [])
    const collections = files.find((file) => file.relativePath === 'convex/ginkoCms/collections.ts')

    expect(collections?.exportNames).toContain('checkCollectionContracts')
    expect(collections?.exportNames).toContain('installCollectionContracts')
    expect(collections?.exportNames).not.toContain('checkCollectionContractsAuthed')
    expect(collections?.exportNames).not.toContain('installCollectionContractsAuthed')
  })

  it('renders a canonical convex config for a fresh host app', () => {
    expect(renderConvexConfig(null)).toBe(
      [
        "import betterAuth from '@convex-dev/better-auth/convex.config'",
        "import { defineApp } from 'convex/server'",
        "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
        '',
        'const app = defineApp()',
        '',
        "app.use(betterAuth, { name: 'betterAuth' })",
        'app.use(ginkoCms)',
        '',
        'export default app',
        '',
      ].join('\n'),
    )
  })

  it('leaves an explicitly configured convex config unchanged', () => {
    const current = [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
      "import customThing from './customThing'",
      '',
      'const cmsApp = defineApp()',
      '',
      "cmsApp.use(betterAuth, { name: 'betterAuth' })",
      'cmsApp.use(ginkoCms)',
      'cmsApp.use(customThing)',
      '',
      'export default cmsApp',
      '',
    ].join('\n')

    expect(renderConvexConfig(current)).toBe(current)
  })

  it('rejects stale convex config imports instead of rewriting existing host files', () => {
    const current = [
      "import betterAuth from '@lupinum/ginko-cms/convex/better-auth'",
      "import { defineApp } from 'convex/server'",
      "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
      "import ginkoCms from '@lupinum/ginko-cms/convex.config'",
      "import ginkoCms from '@lupinum/ginko-cms/convex/config'",
      '',
      'const cmsApp = defineApp()',
      '',
      "cmsApp.use(betterAuth, { name: 'betterAuth' })",
      '// @ginko-cms-managed-start: @lupinum/ginko-cms convex-component',
      'cmsApp.use(ginkoCms)',
      '// @ginko-cms-managed-end: @lupinum/ginko-cms convex-component',
      '',
      'cmsApp.use(ginkoCms)',
      'cmsApp.use(otherComponent)',
      '',
      'export default cmsApp',
      '',
    ].join('\n')

    expect(() => renderConvexConfig(current)).toThrow(
      'convex/convex.config.ts exists, so Ginko CMS will not rewrite it automatically.',
    )
    expect(() => renderConvexConfig(current)).toThrow(
      'Import Better Auth from @convex-dev/better-auth/convex.config.',
    )
  })

  it('rejects missing ginkoCms registration instead of inserting a managed block', () => {
    const current = [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
      "import customThing from './customThing'",
      '',
      'const app = defineApp()',
      '',
      "app.use(betterAuth, { name: 'betterAuth' })",
      '',
      'app.use(customThing)',
      '',
      'export default app',
      '',
    ].join('\n')

    expect(() => renderConvexConfig(current)).toThrow(
      'Register the Ginko CMS Convex component with app.use(ginkoCms).',
    )
  })

  it('rejects ginkoCms registrations mounted on a different Convex app', () => {
    const current = [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
      '',
      'const app = defineApp()',
      'const otherApp = defineApp()',
      '',
      "app.use(betterAuth, { name: 'betterAuth' })",
      'otherApp.use(ginkoCms)',
      '',
      'export default app',
      '',
    ].join('\n')

    expect(() => renderConvexConfig(current)).toThrow(
      'Register the Ginko CMS Convex component with app.use(ginkoCms).',
    )
  })

  it('supports multiline app setup when ginkoCms is explicitly registered', () => {
    const current = [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
      '',
      'const cmsApp =',
      '  defineApp()',
      '',
      'cmsApp.use(betterAuth, {',
      "  name: 'betterAuth',",
      '})',
      'cmsApp.use(ginkoCms)',
      '',
      'export default cmsApp',
      '',
    ].join('\n')

    expect(renderConvexConfig(current)).toBe(current)
  })

  it('rejects missing better-auth registration for existing convex config files', () => {
    const current = [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
      '',
      'const cmsApp =',
      '  defineApp()',
      'cmsApp.use(ginkoCms)',
      '',
      'export default cmsApp',
      '',
    ].join('\n')

    expect(() => renderConvexConfig(current)).toThrow(
      'Register Better Auth with app.use(betterAuth, { name: "betterAuth" }).',
    )
  })

  it('rejects unnamed Better Auth component registrations', () => {
    const current = [
      "import betterAuth from '@convex-dev/better-auth/convex.config'",
      "import { defineApp } from 'convex/server'",
      "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
      '',
      'const app = defineApp()',
      'app.use(betterAuth)',
      'app.use(ginkoCms)',
      '',
      'export default app',
      '',
    ].join('\n')

    expect(() => renderConvexConfig(current)).toThrow(
      'Register Better Auth with app.use(betterAuth, { name: "betterAuth" }).',
    )
  })

  it('seeds auth.config.ts once and validates later app-owned edits', () => {
    const authConfigEdit = ginkoCmsBridgeManifest.managedEdits.find(
      (edit) => edit.relativePath === 'convex/auth.config.ts',
    )

    expect(authConfigEdit).toBeDefined()
    expect(authConfigEdit?.apply(null)).toContain('getAuthConfigProvider')
    expect(() => authConfigEdit?.apply('export default { providers: [] }\n')).toThrow(
      'convex/auth.config.ts exists, so Ginko CMS will not rewrite it automatically.',
    )
    const current = [
      "import { getAuthConfigProvider, type AuthConfig } from '@lupinum/ginko-cms/convex/auth-config'",
      '',
      'export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig',
      '',
    ].join('\n')

    expect(renderAuthConfig(current)).toBe(current)
  })

  it('seeds the required users schema for auth sync', () => {
    const schema = renderSchema(null)

    expect(schema).toContain('users: defineTable({')
    expect(schema).toContain(".index('by_auth_key', ['authKey'])")
    expect(schema).not.toContain('updatedAt: v.number(),\n  })')
  })

  it('only treats exact generated managed setup as verifier-resettable', async () => {
    const { shouldResetAutoGeneratedConsumerSetup } =
      await import('../../scripts/foundation-verify.mjs')
    const schema = renderSchema(null)
    const schemaWithOldDanglingComma = schema.replace(
      'updatedAt: v.number()',
      'updatedAt: v.number(),',
    )
    const editedSchema = schema.replace(
      "  }).index('by_auth_key', ['authKey'])\n})",
      "  }).index('by_auth_key', ['authKey']),\n  posts: defineTable({ title: v.string() })\n})",
    )

    expect(shouldResetAutoGeneratedConsumerSetup(schema, schema)).toBe(true)
    expect(shouldResetAutoGeneratedConsumerSetup(schemaWithOldDanglingComma, schema)).toBe(true)
    expect(shouldResetAutoGeneratedConsumerSetup(editedSchema, schema)).toBe(false)
  })

  it('leaves explicitly configured existing schema unchanged', () => {
    const current = [
      "import { defineSchema, defineTable } from 'convex/server'",
      "import { v } from 'convex/values'",
      '',
      'export default defineSchema({',
      "  users: defineTable({ authKey: v.string() }).index('by_auth_key', ['authKey']),",
      '})',
      '',
    ].join('\n')

    expect(renderSchema(current)).toBe(current)
  })

  it('rejects existing schema files that need import rewrites', () => {
    expect(() =>
      renderSchema(
        [
          "import { defineSchema, defineTable } from '@lupinum/ginko-cms/convex/server'",
          "import { v } from '@lupinum/ginko-cms/convex/values'",
          '',
          'export default defineSchema({',
          "  users: defineTable({ authKey: v.string() }).index('by_auth_key', ['authKey']),",
          '})',
          '',
        ].join('\n'),
      ),
    ).toThrow('Import defineSchema/defineTable from convex/server.')
  })

  it('rejects existing schema files missing defineTable import', () => {
    expect(() =>
      renderSchema(
        [
          "import { defineSchema } from 'convex/server'",
          "import { v } from 'convex/values'",
          '',
          'export default defineSchema({',
          "  users: defineTable({ authKey: v.string() }).index('by_auth_key', ['authKey']),",
          '})',
          '',
        ].join('\n'),
      ),
    ).toThrow('Import defineSchema/defineTable from convex/server.')
  })

  it('rejects an existing schema without the required users index', () => {
    expect(() => renderSchema('export default defineSchema({})\n')).toThrow(
      'Define a users table with a by_auth_key index.',
    )
  })

  it('fails fast when the host config has no supported Convex app binding', () => {
    expect(() =>
      renderConvexConfig("import ginkoCms from '@lupinum/ginko-cms/convex.config'\n"),
    ).toThrow('Create the Convex app with defineApp().')
  })
})
