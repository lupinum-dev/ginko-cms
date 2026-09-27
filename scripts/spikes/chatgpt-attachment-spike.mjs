// Offline protocol probe. No listener, download, storage write or OAuth connection.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

const candidate = process.argv[2]
assert(candidate, 'Pass a built better-convex packages/mcp directory.')
const { defineMcpTool, handleMcpRequest } = await import(
  pathToFileURL(resolve(candidate, 'dist/index.mjs')).href
)
const { listMcpCatalog } = await import(pathToFileURL(resolve(candidate, 'dist/test.mjs')).href)
assert.equal(typeof defineMcpTool, 'function', 'Candidate must provide defineMcpTool.')

// All four properties must be declared; only these two may be required.
// Keep the file object at the top level, directly or as an array item.
const file = z.object({
  download_url: z.url(),
  file_id: z.string().min(1),
  mime_type: z.string().optional(),
  file_name: z.string().optional(),
})
const inputSchema = z.object({ images: z.array(file).min(1).max(2) })
const resource = new URL('https://attachment-spike.example.test/mcp')
const issuer = 'https://attachment-spike.example.test/api/auth'
const bearer = 'synthetic-attachment-bearer'
const access = {
  issuer,
  resource: resource.href,
  subject: 'synthetic-user',
  clientId: 'synthetic-client',
  scopes: ['cms.read'],
}
let enabled = true
let calls = 0
const configureServer = ({ server, tools }) => {
  const tool = defineMcpTool(tools, {
    name: 'inspect-attachments',
    description: 'Inspect attachment field presence without downloading or saving files.',
    risk: 'read',
    scopes: ['cms.read'],
    inputSchema,
    _meta: { 'openai/fileParams': ['images'] },
    handler: ({ images }) => {
      calls += 1
      // Do not echo signed URLs, provider file IDs, filenames or MIME values.
      const diagnostic = {
        count: images.length,
        optionalMetadata: images.map((image) => ({
          mimeTypePresent: image.mime_type !== undefined,
          fileNamePresent: image.file_name !== undefined,
        })),
      }
      return { content: [{ type: 'text', text: JSON.stringify(diagnostic) }] }
    },
  })
  server.registerTool(tool.name, tool.config, tool.handler)
}
const options = {
  resource,
  serverInfo: { name: 'offline-attachment-spike', version: '0.0.0' },
  authorization: {
    mode: 'oauth',
    issuer,
    requiredScopes: ['cms.read'],
    scopesSupported: ['cms.read'],
    verifier: {
      async verifyAccessToken(token) {
        if (!enabled || token !== bearer) throw new Error('Synthetic credential denied.')
        return {
          access,
          principal: { userId: access.subject },
          expiresAt: Math.floor(Date.now() / 1000) + 60,
        }
      },
    },
  },
  configureServer,
}
const catalog = await listMcpCatalog({
  configureServer,
  access,
  principal: { userId: access.subject },
  requiredScopes: ['cms.read'],
  scopesSupported: ['cms.read'],
})
assert.equal(catalog.tools.length, 1)
const descriptor = catalog.tools[0]
assert.deepEqual(descriptor._meta['openai/fileParams'], ['images'])
const item = descriptor.inputSchema.properties.images.items
assert.deepEqual(Object.keys(item.properties).sort(), [
  'download_url',
  'file_id',
  'file_name',
  'mime_type',
])
assert.deepEqual([...item.required].sort(), ['download_url', 'file_id'])
assert.deepEqual(descriptor._meta.securitySchemes, [{ type: 'oauth2', scopes: ['cms.read'] }])

async function call(argumentsValue, token = bearer) {
  const response = await handleMcpRequest(
    new Request(resource, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'mcp-method': 'tools/call',
        'mcp-name': 'inspect-attachments',
        'mcp-protocol-version': '2026-07-28',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'inspect-attachments',
          arguments: argumentsValue,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'offline-spike', version: '0.0.0' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    }),
    options,
  )
  return { status: response.status, body: await response.json() }
}
const images = [
  { download_url: 'https://files.example.test/a?signature=secret-one', file_id: 'file-secret-one' },
  {
    download_url: 'https://files.example.test/b?signature=secret-two',
    file_id: 'file-secret-two',
    mime_type: 'image/png',
    file_name: 'private-name.png',
  },
]
for (let retry = 0; retry < 2; retry += 1) {
  const result = await call({ images })
  assert.equal(result.status, 200)
  assert.equal(result.body.error, undefined)
  assert.equal(result.body.result.isError, undefined)
  assert.deepEqual(JSON.parse(result.body.result.content[0].text), {
    count: 2,
    optionalMetadata: [
      { mimeTypePresent: false, fileNamePresent: false },
      { mimeTypePresent: true, fileNamePresent: true },
    ],
  })
  assert.doesNotMatch(JSON.stringify(result.body), /secret-|private-name|download_url|file_id/)
}
assert.equal(calls, 2)
for (const invalid of [
  { images: [{ download_url: images[0].download_url }] },
  { images: [{ file_id: images[0].file_id }] },
  { images: [{ download_url: 'not a URL', file_id: 'file' }] },
  { images: [{ downloadUrl: images[0].download_url, fileId: images[0].file_id }] },
  { images: [] },
]) {
  const result = await call(invalid)
  assert(result.body.error || result.body.result?.isError)
}
assert.equal(calls, 2, 'Malformed input must never reach the diagnostic handler.')
assert.equal((await call({ images }, 'wrong-credential')).status, 401)
enabled = false
assert.equal((await call({ images })).status, 401)
assert.equal(calls, 2, 'Revoked or foreign credentials must never reach the handler.')
console.log(
  JSON.stringify({
    result: 'PASS',
    catalog: 'top-level array; four declared fields; only URL and file ID required',
    calls: 'two-image input with and without optional metadata; repeat; malformed and denied input',
    effects: 'none; all protocol requests stayed in memory',
  }),
)
