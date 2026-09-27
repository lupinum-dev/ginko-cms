import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadRemoteImage } from '../../packages/cms/src/server/utils/remote-image-download'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:https', () => ({ request: mocks.request }))

const source = 'https://images.example.com/attachment?signature=secret'
const image = Buffer.from([137, 80, 78, 71])

function respond(
  input: {
    status?: number
    headers?: Record<string, string | undefined>
    chunks?: Buffer[]
    stalled?: boolean
  } = {},
) {
  const body = input.stalled ? new Readable({ read() {} }) : Readable.from(input.chunks ?? [image])
  const response = Object.assign(body, {
    statusCode: input.status ?? 200,
    headers: input.headers ?? { 'content-type': 'image/png' },
  })
  mocks.request.mockImplementation((_url, options, callback) => {
    const req = Object.assign(new EventEmitter(), {
      end: () => {
        queueMicrotask(() => callback(response))
      },
    })
    options.signal.addEventListener(
      'abort',
      () => {
        response.destroy(new Error('upstream secret must not leak'))
        req.emit('error', new Error('upstream secret must not leak'))
      },
      { once: true },
    )
    return req
  })
  return response
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  respond()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('remote image download boundary', () => {
  it('does not expose DNS errors containing upstream secrets', async () => {
    mocks.lookup.mockRejectedValue(new Error('secret upstream diagnostic'))
    await expect(downloadRemoteImage(source)).rejects.toThrow(
      'Remote image hostname lookup failed.',
    )
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('does not expose connection errors containing signed URLs', async () => {
    mocks.request.mockImplementation(() => {
      const req = Object.assign(new EventEmitter(), {
        end: () => {
          queueMicrotask(() => req.emit('error', new Error(source)))
        },
      })
      return req
    })
    await expect(downloadRemoteImage(source)).rejects.toThrow('Remote image connection failed.')
  })

  it('pins the validated DNS answer and sends no caller credentials', async () => {
    await expect(downloadRemoteImage(source)).resolves.toEqual({
      bytes: image,
      mediaType: 'image/png',
    })
    const [url, options] = mocks.request.mock.calls[0]!
    expect(url.href).toBe(source)
    expect(options.agent).toBe(false)
    expect(options.headers).toEqual({
      accept: 'image/gif, image/jpeg, image/png, image/webp',
      'accept-encoding': 'identity',
    })
    const callback = vi.fn()
    options.lookup(url.hostname, { all: false }, callback)
    expect(callback).toHaveBeenLastCalledWith(null, '93.184.216.34', 4)
    options.lookup(url.hostname, { all: true }, callback)
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it.each([
    'not a URL',
    'http://images.example.com/a',
    'https://user:password@images.example.com/a',
    'https://images.example.com:444/a',
    'https://images.example.com/a#fragment',
    'https://127.0.0.1/a',
    'https://0x7f000001/a',
    'https://2130706433/a',
    'https://[::1]/a',
    'https://[::ffff:127.0.0.1]/a',
    'https://localhost/a',
    'https://images.example.com./a',
  ])('rejects unsafe URL %s before DNS or connection', async (url) => {
    await expect(downloadRemoteImage(url)).rejects.toThrow()
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.100.100.200',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '64:ff9b::a00:1',
    '2001:db8::1',
    '2001::1',
    '2002:7f00:1::',
    '3fff::1',
  ])('rejects nonpublic DNS answer %s without connecting', async (address) => {
    mocks.lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }])
    await expect(downloadRemoteImage(source)).rejects.toThrow(/public addresses/)
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('rejects mixed public/private and empty DNS answers', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ])
    await expect(downloadRemoteImage(source)).rejects.toThrow(/public addresses/)
    mocks.lookup.mockResolvedValue([])
    await expect(downloadRemoteImage(source)).rejects.toThrow(/public addresses/)
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('accepts public IPv6 and a supported content-type with parameters', async () => {
    mocks.lookup.mockResolvedValue([{ address: '2606:4700:4700::1111', family: 6 }])
    respond({ headers: { 'content-type': 'image/webp; charset=binary' } })
    await expect(downloadRemoteImage(source)).resolves.toMatchObject({ mediaType: 'image/webp' })
  })

  it.each([301, 302, 303, 307, 308, 404, 500])(
    'rejects HTTP %i without following its location',
    async (status) => {
      const response = respond({
        status,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      })
      await expect(downloadRemoteImage(source)).rejects.toThrow(/response was rejected/)
      expect(mocks.request).toHaveBeenCalledTimes(1)
      expect(response.destroyed).toBe(true)
    },
  )

  it.each([
    {},
    { 'content-type': 'image/svg+xml' },
    { 'content-type': 'text/html' },
    { 'content-type': 'image/png', 'content-encoding': 'gzip' },
    { 'content-type': 'image/png', 'content-length': '26214401' },
    { 'content-type': 'image/png', 'content-length': 'garbage' },
    { 'content-type': 'image/png', 'content-length': '0' },
    { 'content-type': 'image/png', 'content-length': '5' },
  ])('rejects unsupported response headers or length %j', async (headers) => {
    const response = respond({ headers })
    await expect(downloadRemoteImage(source)).rejects.toThrow(/response was rejected/)
    expect(response.destroyed).toBe(true)
  })

  it('bounds chunked responses without trusting Content-Length', async () => {
    const response = respond({ chunks: [Buffer.alloc(25 * 1024 * 1024), image] })
    await expect(downloadRemoteImage(source)).rejects.toThrow(/response was rejected/)
    expect(response.destroyed).toBe(true)
  })

  it('rejects empty responses', async () => {
    respond({ chunks: [] })
    await expect(downloadRemoteImage(source)).rejects.toThrow(/response was rejected/)
  })

  it('times out stalled DNS without connecting after it eventually resolves', async () => {
    vi.useFakeTimers()
    let finishLookup: (addresses: { address: string; family: number }[]) => void = () => {}
    mocks.lookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLookup = resolve
        }),
    )
    const result = expect(downloadRemoteImage(source)).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(15_000)
    await result
    finishLookup([{ address: '93.184.216.34', family: 4 }])
    await Promise.resolve()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('aborts stalled bodies within the same total deadline and hides upstream secrets', async () => {
    vi.useFakeTimers()
    const response = respond({ stalled: true })
    const result = expect(downloadRemoteImage(source)).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(15_000)
    await result
    expect(response.destroyed).toBe(true)
  })
})
