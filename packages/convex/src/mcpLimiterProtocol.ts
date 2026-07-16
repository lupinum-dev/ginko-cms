const SIGNATURE_DOMAIN = 'ginko-cms:mcp-auth-limiter:v1'
const BUCKET_DOMAIN = 'ginko-cms:mcp-auth-limiter:bucket:v1'

export type McpLimiterOperation = 'check' | 'record'

export type McpLimiterSignedPayload = {
  operation: McpLimiterOperation
  ipBucketKey: string
  credentialBucketKey: string
  requestId: string
  timestamp: number
}

async function hmacHex(secret: string, value: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function deriveMcpLimiterBucketKey(
  secret: string,
  kind: 'ip' | 'credential',
  value: string,
) {
  return await hmacHex(secret, `${BUCKET_DOMAIN}\n${kind}\n${value}`)
}

export async function signMcpLimiterPayload(secret: string, payload: McpLimiterSignedPayload) {
  return await hmacHex(
    secret,
    [
      SIGNATURE_DOMAIN,
      payload.operation,
      payload.ipBucketKey,
      payload.credentialBucketKey,
      payload.requestId,
      String(payload.timestamp),
    ].join('\n'),
  )
}

export async function verifyMcpLimiterPayloadSignature(
  secret: string,
  payload: McpLimiterSignedPayload,
  signature: string,
) {
  const expected = await signMcpLimiterPayload(secret, payload)
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
  }
  return mismatch === 0
}

export async function assertMcpLimiterSignedRequest(
  secret: string,
  operation: McpLimiterOperation,
  args: Omit<McpLimiterSignedPayload, 'operation'> & { signature: string },
  now = Date.now(),
) {
  if (Math.abs(now - args.timestamp) > 30_000) {
    throw new Error('MCP limiter request is stale.')
  }
  if (
    !/^[a-f0-9]{64}$/.test(args.ipBucketKey) ||
    !/^[a-f0-9]{64}$/.test(args.credentialBucketKey)
  ) {
    throw new Error('MCP limiter bucket key is invalid.')
  }
  if (!/^[\w.:-]{1,128}$/.test(args.requestId)) {
    throw new Error('MCP limiter request ID is invalid.')
  }
  const valid = await verifyMcpLimiterPayloadSignature(
    secret,
    {
      operation,
      ipBucketKey: args.ipBucketKey,
      credentialBucketKey: args.credentialBucketKey,
      requestId: args.requestId,
      timestamp: args.timestamp,
    },
    args.signature,
  )
  if (!valid) throw new Error('MCP limiter signature is invalid.')
}

export async function runVerifiedMcpLimiterRequest<T>(
  secret: string,
  operation: McpLimiterOperation,
  args: Omit<McpLimiterSignedPayload, 'operation'> & { signature: string },
  execute: () => Promise<T>,
): Promise<T> {
  await assertMcpLimiterSignedRequest(secret, operation, args)
  return await execute()
}
