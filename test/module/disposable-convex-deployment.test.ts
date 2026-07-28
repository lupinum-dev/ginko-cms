import { describe, expect, it } from 'vitest'

import { validateDisposableConvexDeployment } from '../../scripts/disposable-convex-deployment.mjs'

function environment(overrides: Record<string, string> = {}) {
  return {
    CONVEX_DEPLOYMENT: 'dev:ginko-release-proof',
    CONVEX_DEPLOY_KEY: 'dev:ginko-release-proof|secret',
    CONVEX_SITE_URL: 'https://ginko-release-proof.convex.site',
    CONVEX_URL: 'https://ginko-release-proof.convex.cloud',
    GINKO_CMS_DISPOSABLE_DEPLOYMENT: '1',
    ...overrides,
  }
}

describe('disposable Convex release deployment', () => {
  it('accepts one matching dedicated development deployment', () => {
    expect(validateDisposableConvexDeployment(environment())).toEqual({
      deployment: 'dev:ginko-release-proof',
      deploymentName: 'ginko-release-proof',
    })
  })

  it.each([
    [{ GINKO_CMS_DISPOSABLE_DEPLOYMENT: '0' }, /never run release proof against a shared/u],
    [{ CONVEX_DEPLOYMENT: 'prod:ginko-release-proof' }, /never production/u],
    [{ CONVEX_DEPLOY_KEY: 'dev:another-deployment|secret' }, /does not belong/u],
    [{ CONVEX_URL: 'https://another-deployment.convex.cloud' }, /does not belong/u],
    [{ CONVEX_SITE_URL: 'https://another-deployment.convex.site' }, /does not belong/u],
    [{ CONVEX_URL: 'http://ginko-release-proof.convex.cloud' }, /bare Convex HTTPS origin/u],
  ])('rejects unsafe or mismatched configuration %#', (overrides, expected) => {
    expect(() => validateDisposableConvexDeployment(environment(overrides))).toThrow(expected)
  })
})
