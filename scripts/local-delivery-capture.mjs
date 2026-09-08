#!/usr/bin/env node

import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_BODY_BYTES = 16 * 1024
const MAX_MESSAGES = 50

function requiredSecret(environment) {
  const secret = environment.GINKO_LOCAL_DELIVERY_SECRET?.trim()
  if (!secret) throw new Error('GINKO_LOCAL_DELIVERY_SECRET is required.')
  return secret
}

function safeUrl(value, label) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${label} must be an HTTP(S) URL without embedded credentials.`)
  }
  return url.toString()
}

function messageFrom(pathname, body) {
  if (pathname === '/password-recovery') {
    return {
      kind: 'Password recovery',
      recipient: body?.recipient?.email,
      url: safeUrl(body?.recoveryUrl, 'recoveryUrl'),
    }
  }
  if (pathname === '/email-verification') {
    return {
      kind: 'Email verification',
      recipient: body?.recipient?.email,
      url: safeUrl(body?.verificationUrl, 'verificationUrl'),
    }
  }
  if (pathname === '/member-invitation') {
    return {
      kind: `Member invitation (${body?.role ?? 'unknown role'})`,
      recipient: body?.email,
      url: safeUrl(body?.acceptUrl, 'acceptUrl'),
    }
  }
  throw new Error('Unknown delivery endpoint.')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function inboxHtml(messages) {
  const rows = messages
    .map(
      (message) => `<li><strong>${escapeHtml(message.kind)}</strong><br>
<span>${escapeHtml(message.recipient)}</span><br>
<a href="${escapeHtml(message.url)}">Open one-time link</a></li>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="robots" content="noindex"><title>Ginko local delivery inbox</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:48rem;margin:3rem auto;padding:0 1rem}li{margin:1.5rem 0}a{overflow-wrap:anywhere}</style>
</head><body><h1>Ginko local delivery inbox</h1>
<p>Messages stay in memory and disappear when this development process stops.</p>
<ol>${rows || '<li>No messages captured.</li>'}</ol></body></html>`
}

async function readJsonBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw new Error('Delivery payload is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function startLocalDeliveryCapture({ environment = process.env, port } = {}) {
  const secret = requiredSecret(environment)
  const messages = []
  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    try {
      if (request.method === 'GET' && request.url === '/') {
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.end(inboxHtml(messages))
        return
      }
      if (
        request.method !== 'POST' ||
        !['/password-recovery', '/email-verification', '/member-invitation'].includes(request.url)
      ) {
        response.statusCode = 404
        response.end('Not found')
        return
      }
      if (request.headers.authorization !== `Bearer ${secret}`) {
        response.statusCode = 401
        response.end('Unauthorized')
        return
      }
      const message = messageFrom(request.url, await readJsonBody(request))
      if (typeof message.recipient !== 'string' || !message.recipient.includes('@')) {
        throw new Error('Delivery recipient is invalid.')
      }
      messages.unshift(message)
      messages.splice(MAX_MESSAGES)
      response.statusCode = 204
      response.end()
    } catch {
      response.statusCode = 400
      response.end('Invalid delivery payload')
    }
  })
  server.listen(port ?? Number(environment.GINKO_LOCAL_DELIVERY_PORT ?? 5251), '127.0.0.1')
  return { messages, server }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = startLocalDeliveryCapture()
  server.once('listening', () => {
    const address = server.address()
    console.log(`[delivery] Ready at http://127.0.0.1:${address.port}`)
  })
}
