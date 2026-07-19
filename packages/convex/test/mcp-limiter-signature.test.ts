import { describe, expect, it, vi } from 'vitest'

import {
  assertMcpCallerSignedRequest,
  assertMcpLimiterSignedRequest,
  deriveMcpLimiterBucketKey,
  runVerifiedMcpLimiterRequest,
  signMcpLimiterPayload,
  signMcpCallerPayload,
  verifyMcpLimiterPayloadSignature,
} from '../src/mcpLimiterProtocol.js'

describe('MCP limiter signatures', () => {
  it('domain-separates opaque IP and credential buckets', async () => {
    const secret = 'test-secret'
    const ip = await deriveMcpLimiterBucketKey(secret, 'ip', '203.0.113.4')
    const credential = await deriveMcpLimiterBucketKey(secret, 'credential', '203.0.113.4')
    expect(ip).toMatch(/^[a-f0-9]{64}$/)
    expect(credential).toMatch(/^[a-f0-9]{64}$/)
    expect(ip).not.toBe(credential)
    expect(ip).not.toContain('203.0.113.4')
  })

  it('rejects altered operations, keys, request IDs, timestamps, and signatures', async () => {
    const secret = 'test-secret'
    const payload = {
      operation: 'record' as const,
      ipBucketKey: 'a'.repeat(64),
      credentialBucketKey: 'b'.repeat(64),
      requestId: 'request-1',
      timestamp: 1234,
    }
    const signature = await signMcpLimiterPayload(secret, payload)
    await expect(verifyMcpLimiterPayloadSignature(secret, payload, signature)).resolves.toBe(true)
    await expect(
      verifyMcpLimiterPayloadSignature(secret, { ...payload, operation: 'check' }, signature),
    ).resolves.toBe(false)
    await expect(
      verifyMcpLimiterPayloadSignature(secret, { ...payload, requestId: 'request-2' }, signature),
    ).resolves.toBe(false)
    await expect(verifyMcpLimiterPayloadSignature(secret, payload, '0'.repeat(64))).resolves.toBe(
      false,
    )
    await expect(
      assertMcpLimiterSignedRequest(
        secret,
        'record',
        { ...payload, signature, timestamp: 1_000 },
        31_001,
      ),
    ).rejects.toThrow('stale')
    await expect(
      assertMcpLimiterSignedRequest(
        secret,
        'record',
        { ...payload, signature: '0'.repeat(64) },
        payload.timestamp,
      ),
    ).rejects.toThrow('signature')
    await expect(
      assertMcpLimiterSignedRequest(
        secret,
        'record',
        { ...payload, ipBucketKey: 'random-key', signature },
        payload.timestamp,
      ),
    ).rejects.toThrow('bucket key')
  })

  it('never executes the host bridge operation before signature verification succeeds', async () => {
    const secret = 'test-secret'
    const payload = {
      operation: 'record' as const,
      ipBucketKey: 'a'.repeat(64),
      credentialBucketKey: 'b'.repeat(64),
      requestId: 'request-1',
      timestamp: Date.now(),
    }
    const execute = vi.fn(async () => ({ limited: false }))

    await expect(
      runVerifiedMcpLimiterRequest(
        secret,
        'record',
        { ...payload, signature: '0'.repeat(64) },
        execute,
      ),
    ).rejects.toThrow('signature')
    expect(execute).not.toHaveBeenCalled()

    const stalePayload = { ...payload, timestamp: Date.now() - 31_000 }
    const staleSignature = await signMcpLimiterPayload(secret, stalePayload)
    await expect(
      runVerifiedMcpLimiterRequest(
        secret,
        'record',
        { ...stalePayload, signature: staleSignature },
        execute,
      ),
    ).rejects.toThrow('stale')
    expect(execute).not.toHaveBeenCalled()

    const signature = await signMcpLimiterPayload(secret, payload)
    await expect(
      runVerifiedMcpLimiterRequest(secret, 'record', { ...payload, signature }, execute),
    ).resolves.toEqual({ limited: false })
    expect(execute).toHaveBeenCalledOnce()
  })
})

describe('MCP caller assertions', () => {
  it('binds a short-lived assertion to one function and credential hash', async () => {
    const secret = 'test-secret'
    const payload = {
      operation: 'mutation:ginkoCms/editor:mcpSaveEntryDraft',
      credentialHash: 'a'.repeat(64),
      requestId: 'request-1',
      timestamp: 10_000,
    }
    const signature = await signMcpCallerPayload(secret, payload)
    const args = {
      credentialHash: payload.credentialHash,
      requestId: payload.requestId,
      timestamp: payload.timestamp,
      signature,
    }

    await expect(
      assertMcpCallerSignedRequest(secret, payload.operation, args, payload.timestamp),
    ).resolves.toBeUndefined()
    await expect(
      assertMcpCallerSignedRequest(
        secret,
        'mutation:ginkoCms/editor:mcpCreateEntry',
        args,
        payload.timestamp,
      ),
    ).rejects.toThrow('signature')
    await expect(
      assertMcpCallerSignedRequest(
        secret,
        payload.operation,
        { ...args, credentialHash: 'b'.repeat(64) },
        payload.timestamp,
      ),
    ).rejects.toThrow('signature')
    await expect(
      assertMcpCallerSignedRequest(secret, payload.operation, args, payload.timestamp + 30_001),
    ).rejects.toThrow('stale')
  })
})
