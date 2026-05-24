import { computed, shallowRef } from 'vue'

let debugEnabled = false
let debugSequence = 0

const EDITOR_DEBUG_PREFIX = 'Editor'
const MAX_DEBUG_EVENTS = 400

export interface EditorDebugEvent {
  id: string
  level: 'error' | 'log' | 'warn'
  message: string
  payload?: unknown
  source: string
  timestamp: string
}

const debugEvents = shallowRef<EditorDebugEvent[]>([])

export const editorDebug = {
  error: (...args: unknown[]) => {
    writeDebugEvent('error', 'runtime', args)
    if (debugEnabled) {
      console.error(EDITOR_DEBUG_PREFIX, ...args)
    }
  },
  log: (...args: unknown[]) => {
    writeDebugEvent('log', 'runtime', args)
    if (debugEnabled) {
      console.warn(EDITOR_DEBUG_PREFIX, ...args)
    }
  },
  warn: (...args: unknown[]) => {
    writeDebugEvent('warn', 'runtime', args)
    if (debugEnabled) {
      console.warn(EDITOR_DEBUG_PREFIX, ...args)
    }
  },
}

export function clearEditorDebugEvents() {
  debugEvents.value = []
}

export function getEditorDebugEvents() {
  return computed(() => debugEvents.value)
}

export function isDebugEnabled() {
  return debugEnabled
}

export function pushEditorDebugEvent(event: Omit<EditorDebugEvent, 'id' | 'timestamp'>) {
  if (!debugEnabled) {
    return null
  }

  const nextEvent: EditorDebugEvent = {
    ...event,
    id: `dbg_${debugSequence++}`,
    timestamp: new Date().toISOString(),
  }
  debugEvents.value = [...debugEvents.value.slice(-(MAX_DEBUG_EVENTS - 1)), nextEvent]
  return nextEvent
}

export function serializeDebugPayload(value: unknown) {
  return sanitizeDebugValue(value)
}

export function setDebugEnabled(enabled: boolean) {
  debugEnabled = enabled
}

function writeDebugEvent(level: EditorDebugEvent['level'], source: string, args: unknown[]) {
  const [first, ...rest] = args
  const message = typeof first === 'string' ? first : 'debug event'
  const payloadCandidates = typeof first === 'string' ? rest : [first, ...rest]

  const payload =
    payloadCandidates.length === 0
      ? undefined
      : payloadCandidates.length === 1
        ? payloadCandidates[0]
        : payloadCandidates

  pushEditorDebugEvent({
    level,
    message,
    payload: sanitizeDebugValue(payload),
    source,
  })
}

function sanitizeDebugValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (isDebugPrimitive(value)) {
    return value
  }
  if (depth > 4) {
    return '[max-depth]'
  }
  if (typeof value === 'function') {
    return sanitizeFunction(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugValue(item, depth + 1, seen))
  }
  if (value instanceof Error) {
    return sanitizeError(value)
  }
  if (typeof value === 'object') {
    return sanitizeObject(value, depth, seen)
  }
  return String(value)
}

function isDebugPrimitive(value: unknown) {
  return (
    value == null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  )
}

function sanitizeFunction(value: { name?: string }) {
  return `[function ${value.name || 'anonymous'}]`
}

function sanitizeError(value: Error) {
  return {
    message: value.message,
    name: value.name,
    stack: value.stack,
  }
}

function sanitizeObject(value: object, depth: number, seen: WeakSet<object>) {
  if (seen.has(value)) {
    return '[circular]'
  }

  seen.add(value)
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = sanitizeDebugValue(entry, depth + 1, seen)
  }
  return result
}
