import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

type Snapshot = {
  initialized: number
  links: string[]
  messages: string
  teardownResponses: number
  toolCalls: Array<{ arguments?: Record<string, unknown>; name: string }>
}

declare global {
  interface Window {
    __GINKO_APP_HOST__: {
      mount(html: string, openLinks: boolean): Promise<void>
      sendInput(input: Record<string, unknown>): Promise<void>
      sendResult(result: CallToolResult): Promise<void>
      snapshot(): Snapshot
      teardown(): Promise<void>
    }
  }
}

let active:
  | {
      bridge: AppBridge
      iframe: HTMLIFrameElement
      listener: (event: MessageEvent) => void
    }
  | undefined
let initialized = 0
let teardownResponses = 0
let messages = ''
const links: string[] = []
const toolCalls: Array<{ arguments?: Record<string, unknown>; name: string }> = []

async function mount(html: string, openLinks: boolean): Promise<void> {
  if (active) throw new Error('A Ginko MCP App is already mounted.')
  initialized = 0
  teardownResponses = 0
  messages = ''
  links.length = 0
  toolCalls.length = 0

  const iframe = document.createElement('iframe')
  iframe.dataset.testid = 'ginko-publish-impact-frame'
  iframe.setAttribute('sandbox', 'allow-scripts')
  document.body.append(iframe)

  const bridge = new AppBridge(
    null,
    { name: 'ginko-app-proof-host', version: '0.0.0' },
    { ...(openLinks ? { openLinks: {} } : {}), serverTools: {} },
    { hostContext: { displayMode: 'inline', platform: 'web', theme: 'light' } },
  )
  bridge.oncalltool = async (params) => {
    const call = {
      ...(params.arguments === undefined ? {} : { arguments: params.arguments }),
      name: params.name,
    }
    toolCalls.push(call)
    if (params.name !== 'preview-publish') {
      return { content: [{ type: 'text', text: 'App tool denied.' }], isError: true }
    }
    const response = await fetch('/__ginko_app_tool__', {
      body: JSON.stringify(call),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    return (await response.json()) as CallToolResult
  }
  bridge.onopenlink = async (params) => {
    links.push(params.url)
    return { isError: true }
  }

  let readyResolve: (() => void) | undefined
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve
  })
  bridge.oninitialized = () => {
    initialized += 1
    readyResolve?.()
  }
  const listener = (event: MessageEvent) => {
    if (event.source === iframe.contentWindow) messages += JSON.stringify(event.data)
  }
  window.addEventListener('message', listener)
  const transport = new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!)
  const send = transport.send.bind(transport)
  transport.send = async (message, options) => {
    messages += JSON.stringify(message)
    await send(message, options)
  }
  await bridge.connect(transport)
  active = { bridge, iframe, listener }
  iframe.srcdoc = html
  await Promise.race([
    ready,
    new Promise<never>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error('Ginko MCP App initialization timed out.')), 5_000)
    }),
  ])
}

async function teardown(): Promise<void> {
  const current = active
  if (!current) return
  try {
    await current.bridge.teardownResource({})
    teardownResponses += 1
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  } finally {
    await current.bridge.close()
    window.removeEventListener('message', current.listener)
    current.iframe.remove()
    active = undefined
  }
}

window.__GINKO_APP_HOST__ = {
  mount,
  sendInput: async (input) => {
    if (!active) throw new Error('No Ginko MCP App is mounted.')
    await active.bridge.sendToolInput({ arguments: input })
  },
  sendResult: async (result) => {
    if (!active) throw new Error('No Ginko MCP App is mounted.')
    await active.bridge.sendToolResult(result)
  },
  snapshot: () => ({
    initialized,
    links: [...links],
    messages,
    teardownResponses,
    toolCalls: toolCalls.map((call) => structuredClone(call)),
  }),
  teardown,
}
