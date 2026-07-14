/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  assertPortableOperatorRequest,
  createPortableAssetAttempt,
  resolvePortableStorageOrigin,
  uploadPortableAssetStream,
} from '#ginko-cms-server/utils/portability-asset-transport'

const bytes = new Uint8Array([1, 2, 3, 4])

function stream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe('portability asset host transport', () => {
  it('returns a random bearer once and stores only a keyed token hash', () => {
    const first = createPortableAssetAttempt('server-secret')
    const second = createPortableAssetAttempt('server-secret')

    expect(first.token).not.toBe(second.token)
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(first.tokenHash).not.toBe(createHash('sha256').update(first.token).digest('hex'))
    expect(first).not.toHaveProperty('secret')
  })

  it('streams exact bytes once to the configured storage origin', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit & { duplex?: string }) => {
      expect(init.redirect).toBe('error')
      expect(init.duplex).toBe('half')
      expect(init.headers).toEqual({ 'content-type': 'image/png' })
      const received = new Uint8Array(await new Response(init.body).arrayBuffer())
      expect(received).toEqual(bytes)
      return new Response(JSON.stringify({ storageId: 'storage-1' }), {
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(
      uploadPortableAssetStream({
        source: stream([bytes.subarray(0, 2), bytes.subarray(2)]),
        uploadUrl: 'https://storage.example.test/upload',
        storageOrigin: 'https://storage.example.test',
        expectedBytes: bytes.byteLength,
        mediaType: 'image/png',
        fetch,
      }),
    ).resolves.toEqual({ storageId: 'storage-1', bytes: 4 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'short', chunks: [bytes.subarray(0, 3)], expectedBytes: 4 },
    { name: 'long', chunks: [bytes], expectedBytes: 3 },
  ])(
    'rejects a $name body instead of recording partial storage',
    async ({ chunks, expectedBytes }) => {
      await expect(
        uploadPortableAssetStream({
          source: stream(chunks),
          uploadUrl: 'https://storage.example.test/upload',
          storageOrigin: 'https://storage.example.test',
          expectedBytes,
          mediaType: 'image/png',
          fetch: async (_url, init) => {
            await new Response(init?.body).arrayBuffer()
            return new Response(JSON.stringify({ storageId: 'storage-1' }))
          },
        }),
      ).rejects.toThrow(/byte length/i)
    },
  )

  it('rejects an upload URL outside the configured storage origin before fetch', async () => {
    const fetch = vi.fn()
    await expect(
      uploadPortableAssetStream({
        source: stream([bytes]),
        uploadUrl: 'https://attacker.example/upload',
        storageOrigin: 'https://storage.example.test',
        expectedBytes: bytes.byteLength,
        mediaType: 'image/png',
        fetch,
      }),
    ).rejects.toThrow(/origin/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts CLI cookie transport but rejects browser-originated Studio requests', () => {
    expect(() => assertPortableOperatorRequest({})).not.toThrow()
    expect(() => assertPortableOperatorRequest({ origin: 'https://cms.example.test' })).toThrow(
      /CLI operator/i,
    )
    expect(() => assertPortableOperatorRequest({ secFetchSite: 'same-origin' })).toThrow(
      /CLI operator/i,
    )
  })

  it('derives one exact storage origin from the configured Convex deployment URL', () => {
    expect(resolvePortableStorageOrigin('https://deployment.convex.cloud')).toBe(
      'https://deployment.convex.cloud',
    )
    expect(() => resolvePortableStorageOrigin('https://deployment.convex.cloud/path')).toThrow(
      /Convex URL/i,
    )
    expect(() => resolvePortableStorageOrigin('http://localhost:3210')).toThrow(/Convex URL/i)
  })
})
