// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const STORAGE_KEY = 'ginko-cms:studio:action-rail-open'
const RAIL_QUERY = '(min-width: 1280px)'

let desktop = true
let listeners: Array<(event: MediaQueryListEvent) => void> = []

function installLocalStorage() {
  const values = new Map<string, string>()
  const storage = {
    get length() {
      return values.size
    },
    clear: vi.fn(() => {
      values.clear()
    }),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  } satisfies Storage

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
}

function installMatchMedia(matches: boolean) {
  desktop = matches
  listeners = []

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === 'change') listeners.push(listener)
      }),
      removeEventListener: vi.fn(
        (_event: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners = listeners.filter((candidate) => candidate !== listener)
        },
      ),
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        listeners.push(listener)
      }),
      removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }),
      dispatchEvent: vi.fn(),
    })),
  })
}

async function loadController(matches = true) {
  vi.resetModules()
  installMatchMedia(matches)
  const { useStudioActionRailController } =
    await import('../../packages/cms/studio-app/src/composables/useStudioActionRailController')
  return useStudioActionRailController()
}

async function setDesktop(matches: boolean) {
  desktop = matches
  for (const listener of listeners) {
    listener({ matches, media: RAIL_QUERY } as MediaQueryListEvent)
  }
  await nextTick()
}

beforeEach(() => {
  vi.restoreAllMocks()
  installLocalStorage()
})

describe('useStudioActionRailController', () => {
  it('defaults the desktop rail to open when no preference exists', async () => {
    const controller = await loadController(true)

    expect(controller.railAsColumn.value).toBe(true)
    expect(controller.open.value).toBe(true)
    expect(controller.collapsed.value).toBe(false)
  })

  it('initializes collapsed desktop state from a stored false preference', async () => {
    localStorage.setItem(STORAGE_KEY, 'false')

    const controller = await loadController(true)

    expect(controller.open.value).toBe(false)
    expect(controller.collapsed.value).toBe(true)
    expect(controller.toggleLabel.value).toBe('Show details')
  })

  it('toggles and persists the desktop rail preference', async () => {
    const controller = await loadController(true)

    controller.toggle()
    await nextTick()

    expect(controller.open.value).toBe(false)
    expect(controller.collapsed.value).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('opens the mobile sheet without mutating the persisted desktop preference', async () => {
    localStorage.setItem(STORAGE_KEY, 'false')
    const controller = await loadController(false)

    controller.toggle()
    await nextTick()

    expect(controller.railAsColumn.value).toBe(false)
    expect(controller.sheetOpen.value).toBe(true)
    expect(controller.showSheet.value).toBe(true)
    expect(controller.open.value).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('closes an open mobile sheet when the layout crosses back to desktop', async () => {
    const controller = await loadController(false)
    controller.toggle()
    await nextTick()

    expect(controller.sheetOpen.value).toBe(true)

    await setDesktop(true)

    expect(controller.railAsColumn.value).toBe(true)
    expect(controller.sheetOpen.value).toBe(false)
    expect(controller.showSheet.value).toBe(false)
  })
})
