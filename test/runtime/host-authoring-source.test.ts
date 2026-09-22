// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  getStudioAuthoringSource,
  readHostBridge,
  setHostBridgeForTesting,
} from '../../packages/cms/studio-app/src/boundary/host-bridge'
import { imageAuthoring } from '../../playground/image-authoring'

describe('Studio host authoring source', () => {
  it('uses this host kit only when the installed Content hash and policy agree', () => {
    const previous = readHostBridge()
    try {
      setHostBridgeForTesting({
        config: {
          ...previous.config,
          contract: { expectedContentHash: 'current', expectedPresentationHash: 'labels' },
          collections: {
            blog: { settings: { authoring: JSON.stringify(imageAuthoring) } },
          },
        },
      })
      const installed = {
        contract: { version: 'current' },
        settings: { componentPolicy: imageAuthoring.policy, authoring: { wrong: 'backend copy' } },
      }
      expect(getStudioAuthoringSource('blog', installed)).toEqual(imageAuthoring)
      expect(
        getStudioAuthoringSource('blog', { ...installed, contract: { version: 'stale' } }),
      ).toBeUndefined()
      expect(
        getStudioAuthoringSource('blog', {
          ...installed,
          settings: { componentPolicy: { components: {} } },
        }),
      ).toBeUndefined()
      expect(getStudioAuthoringSource('missing', installed)).toBeUndefined()
      expect(getStudioAuthoringSource('blog', null)).toBeUndefined()
      setHostBridgeForTesting({
        config: {
          ...readHostBridge().config,
          collections: { blog: { settings: { authoring: '{broken-json' } } },
        },
      })
      expect(getStudioAuthoringSource('blog', installed)).toBeUndefined()
    } finally {
      setHostBridgeForTesting(previous)
    }
  })
})
