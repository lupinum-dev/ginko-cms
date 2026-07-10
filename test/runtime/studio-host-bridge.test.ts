import { describe, expect, it } from 'vitest'

import { studioApiSurface } from '../../packages/cms/src/public/studio-api-surface'
import type { GinkoCmsStudioHostBridge } from '../../packages/cms/src/public/types'
import { buildStudioHostApi } from '../../packages/cms/src/runtime/pages/studio-host-api'

// §10.6 / §10.7 / "Ginko tests": the Studio bridge must never carry `nuxtApp`,
// a raw `convexUrl`, or any backend function absent from the
// `studioApiSurface` allowlist — even when the generated `#convex/api` object
// on the host side has more on it than Studio is allowed to see.

function makeReference(path: string) {
  return { [Symbol.for('functionName')]: path }
}

/** Builds a fake `#convex/api`-shaped object with every surface entry present,
 * plus deliberately unlisted extras that must never leak through. */
function fakeSourceApi(options: { omit?: [string, string]; extraGroup?: boolean } = {}) {
  const ginkoCms: Record<string, Record<string, unknown>> = {}
  for (const [groupName, functions] of Object.entries(studioApiSurface)) {
    const group: Record<string, unknown> = {}
    for (const functionName of Object.keys(functions)) {
      if (options.omit && options.omit[0] === groupName && options.omit[1] === functionName) {
        continue
      }
      group[functionName] = makeReference(`ginkoCms/${groupName}:${functionName}`)
    }
    // An unlisted function inside an otherwise-known group must never cross.
    group.unlistedDangerousFunction = makeReference(`ginkoCms/${groupName}:unlistedDangerous`)
    ginkoCms[groupName] = group
  }
  if (options.extraGroup !== false) {
    // An entirely unlisted group must never cross either.
    ginkoCms.secretAdmin = {
      wipeDatabase: makeReference('ginkoCms/secretAdmin:wipeDatabase'),
    }
  }
  return { api: { ginkoCms }, components: {} }
}

describe('Studio host bridge allowlist (buildStudioHostApi, vNext §10.7)', () => {
  it('picks every declared group/function with its declared kind', () => {
    const source = fakeSourceApi()
    const built = buildStudioHostApi(source.api) as unknown as {
      ginkoCms: Record<string, Record<string, unknown>>
    }

    for (const [groupName, functions] of Object.entries(studioApiSurface)) {
      expect(built.ginkoCms[groupName]).toBeDefined()
      for (const functionName of Object.keys(functions)) {
        expect(built.ginkoCms[groupName]?.[functionName]).toBeDefined()
      }
    }
  })

  it('never lets an unlisted function inside a known group cross the bridge', () => {
    const source = fakeSourceApi()
    const built = buildStudioHostApi(source.api) as unknown as {
      ginkoCms: Record<string, Record<string, unknown>>
    }

    for (const groupName of Object.keys(studioApiSurface)) {
      expect(built.ginkoCms[groupName]).not.toHaveProperty('unlistedDangerousFunction')
    }
  })

  it('never lets an entirely unlisted group cross the bridge', () => {
    const source = fakeSourceApi()
    const built = buildStudioHostApi(source.api) as unknown as {
      ginkoCms: Record<string, unknown>
    }

    expect(built.ginkoCms).not.toHaveProperty('secretAdmin')
    expect(Object.keys(built.ginkoCms).sort()).toEqual(Object.keys(studioApiSurface).sort())
  })

  it('throws a specific, actionable error when a declared function is missing from the source api', () => {
    const source = fakeSourceApi({ omit: ['editor', 'getEntry'] })

    expect(() => buildStudioHostApi(source.api)).toThrow(
      '[ginko-cms] Studio API is missing api.ginkoCms.editor.getEntry.',
    )
  })

  it('throws when the source api object itself is malformed', () => {
    expect(() => buildStudioHostApi(undefined)).toThrow(
      '[ginko-cms] Studio host bridge is missing api.',
    )
    expect(() => buildStudioHostApi({})).toThrow(
      '[ginko-cms] Studio host bridge is missing api.ginkoCms.',
    )
  })

  it('keeps the bridge type free of nuxtApp, convexUrl, getAuthToken, and isAnonymous', () => {
    const bridgeKeys: Array<keyof GinkoCmsStudioHostBridge> = [
      'convexClient',
      'config',
      'api',
      'auth',
      'mcpApiKeys',
      'onSignOut',
    ]
    // Type-level: this line fails to compile if the bridge interface ever grows
    // a `nuxtApp`, `convexUrl`, `getAuthToken`, or `isAnonymous` member again,
    // because such a key would not be assignable to `keyof GinkoCmsStudioHostBridge`.
    const forbidden = ['nuxtApp', 'convexUrl', 'getAuthToken', 'isAnonymous']
    expect(bridgeKeys.map(String)).not.toEqual(expect.arrayContaining(forbidden))
    expect(forbidden.some((key) => bridgeKeys.map(String).includes(key))).toBe(false)
  })
})
