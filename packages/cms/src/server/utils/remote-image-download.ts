import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'

import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'

const DOWNLOAD_TIMEOUT_MS = 15_000
const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4')
// Accept only ordinary global IPv6 unicast, excluding special-purpose,
// documentation and IPv4-transition ranges (including 6to4).
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
blocked.addSubnet('2001::', 23, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')
blocked.addSubnet('3fff::', 20, 'ipv6')

function isPublicAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, 'ipv4')
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
}

function parseDownloadUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Remote image URL is invalid.')
  }
  if (
    value.length > 8192 ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    !url.hostname.includes('.') ||
    url.hostname.endsWith('.')
  )
    throw new Error(
      'Remote images require an HTTPS hostname on the default port without credentials.',
    )
  return url
}

/**
 * Downloads untrusted image bytes in the Node host, never in a Convex fetch.
 * Call only after authorization. The existing upload-session finalizer still
 * owns byte-level image validation and durable asset creation.
 */
export async function downloadRemoteImage(sourceUrl: string) {
  const url = parseDownloadUrl(sourceUrl)
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), DOWNLOAD_TIMEOUT_MS)
  let rejectAborted: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = () => reject(new Error('Remote image download timed out.'))
    abort.signal.addEventListener('abort', rejectAborted, { once: true })
  })

  try {
    return await Promise.race([aborted, download()])
  } finally {
    clearTimeout(timeout)
    if (rejectAborted) abort.signal.removeEventListener('abort', rejectAborted)
  }

  async function download() {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => {
      throw new Error('Remote image hostname lookup failed.')
    })
    abort.signal.throwIfAborted()
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new Error('Remote image hostname must resolve only to public addresses.')
    }
    const address = addresses[0]!
    return await new Promise<{
      bytes: Buffer
      mediaType: (typeof ALLOWED_ASSET_MIME_TYPES)[number]
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          agent: false,
          signal: abort.signal,
          // Pin the checked address into the actual connection. A separate
          // validation lookup followed by ordinary fetch permits DNS rebinding.
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [address])
            else callback(null, address.address, address.family)
          },
          headers: { accept: ALLOWED_ASSET_MIME_TYPES.join(', '), 'accept-encoding': 'identity' },
          maxHeaderSize: 16 * 1024,
        },
        async (response) => {
          try {
            // Node does not follow redirects. Reject all of them rather than
            // forwarding a signed URL, cookie or token to another destination.
            if (response.statusCode !== 200)
              throw new Error('Remote image download requires HTTP 200.')
            if (
              response.headers['content-encoding'] &&
              response.headers['content-encoding'] !== 'identity'
            ) {
              throw new Error('Remote image content encoding is unsupported.')
            }
            const declaredType = response.headers['content-type']
              ?.split(';')[0]
              ?.trim()
              .toLowerCase()
            const mediaType = ALLOWED_ASSET_MIME_TYPES.find((type) => type === declaredType)
            if (!mediaType) throw new Error('Remote image content type is unsupported.')
            const length = response.headers['content-length']
            if (
              length !== undefined &&
              (!/^\d+$/.test(length) || Number(length) < 1 || Number(length) > MAX_ASSET_SIZE_BYTES)
            ) {
              throw new Error('Remote image exceeds the size limit or declares an invalid length.')
            }
            const chunks: Buffer[] = []
            let total = 0
            for await (const chunk of response) {
              if (!Buffer.isBuffer(chunk)) throw new Error('Remote image returned invalid bytes.')
              total += chunk.byteLength
              if (total > MAX_ASSET_SIZE_BYTES)
                throw new Error('Remote image exceeds the size limit.')
              chunks.push(chunk)
            }
            if (!total || (length !== undefined && Number(length) !== total)) {
              throw new Error('Remote image body does not match its declared length.')
            }
            resolve({ bytes: Buffer.concat(chunks, total), mediaType })
          } catch {
            // Do not expose upstream errors: signed query strings are secrets.
            reject(new Error('Remote image response was rejected.'))
          } finally {
            response.destroy()
          }
        },
      )
      req.once('error', () => reject(new Error('Remote image connection failed.')))
      req.end()
    })
  }
}
