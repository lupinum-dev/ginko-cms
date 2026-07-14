import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  uploadPreparedPortableDraftImportAssets,
  type PreparedPortableDraftImport,
} from '../../packages/cms/src/portability/index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('portable asset CLI transfer', () => {
  it('streams each planned upload once through the authenticated CMS host and rehashes it', async () => {
    const content = new Uint8Array([1, 2, 3, 4])
    const token = 'sealed-once'.repeat(4)
    const prepared = await preparedFixture(content)
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init })
      if (init.method === 'POST') {
        return jsonResponse({ state: 'attempt', token, attemptGeneration: 2 })
      }
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(new Uint8Array(await new Response(init.body).arrayBuffer())).toEqual(content)
      return jsonResponse({ state: 'attached', assetId: 'asset-1' })
    })

    await uploadPreparedPortableDraftImportAssets(prepared, {
      cmsOrigin: 'https://cms.example.test',
      sessionCookie: 'better-auth.session_token=owner-session',
      fetch: fetch as typeof globalThis.fetch,
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(calls[0]).toMatchObject({
      url: `https://cms.example.test/api/_ginko/portability/assets/${prepared.assets[0]!.payload.sha256}/attempt`,
      init: {
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          cookie: 'better-auth.session_token=owner-session',
          'x-ginko-portability-run': prepared.runId,
          'x-ginko-portability-payload': prepared.payloadSha256,
        }),
      },
    })
    expect(calls[1]).toMatchObject({
      init: {
        method: 'PUT',
        redirect: 'error',
        headers: expect.objectContaining({
          'content-length': String(content.byteLength),
          'content-type': 'image/png',
          'x-ginko-portability-attempt': token,
          'x-ginko-portability-generation': '2',
        }),
      },
    })
  })

  it('returns without reading bytes when a lost successful response already attached the asset', async () => {
    const prepared = await preparedFixture(new Uint8Array([1, 2, 3, 4]))
    await rm(prepared.directory, { recursive: true, force: true })
    const fetch = vi.fn(async () => jsonResponse({ state: 'attached', assetId: 'asset-1' }))

    await expect(
      uploadPreparedPortableDraftImportAssets(prepared, {
        cmsOrigin: 'https://cms.example.test',
        sessionCookie: 'better-auth.session_token=owner-session',
        fetch: fetch as typeof globalThis.fetch,
      }),
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fails closed when local bytes change after the immutable plan is prepared', async () => {
    const prepared = await preparedFixture(new Uint8Array([1, 2, 3, 4]))
    const file = join(
      prepared.directory,
      'public',
      'ginko-assets',
      `${prepared.assets[0]!.payload.sha256}.png`,
    )
    await writeFile(file, new Uint8Array([4, 3, 2, 1]))
    const fetch = vi.fn(async (_url: string | URL | Request, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        return jsonResponse({
          state: 'attempt',
          token: 'sealed-once'.repeat(4),
          attemptGeneration: 1,
        })
      }
      await new Response(init.body).arrayBuffer()
      return jsonResponse({ state: 'attached', assetId: 'asset-1' })
    })

    await expect(
      uploadPreparedPortableDraftImportAssets(prepared, {
        cmsOrigin: 'https://cms.example.test',
        sessionCookie: 'better-auth.session_token=owner-session',
        fetch: fetch as typeof globalThis.fetch,
      }),
    ).rejects.toThrow(/hash.*plan|planned.*hash/i)
  })
})

async function preparedFixture(content: Uint8Array): Promise<PreparedPortableDraftImport> {
  const directory = await mkdtemp(join(tmpdir(), 'ginko-cms-asset-client-'))
  roots.push(directory)
  const sha256 = createHash('sha256').update(content).digest('hex')
  const file = join(directory, 'public', 'ginko-assets', `${sha256}.png`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
  return {
    planId: 'plan-1',
    runId: 'run-1',
    directory,
    payload: {} as never,
    payloadSha256: 'b'.repeat(64),
    items: [],
    assets: [
      {
        assetKey: sha256,
        inputSha256: 'c'.repeat(64),
        payload: {
          sha256,
          bytes: content.byteLength,
          mediaType: 'image/png',
          effect: 'upload',
          referencedBy: [],
        },
      },
    ],
    documentsByItemKey: {},
    blockers: [],
  }
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
