// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  clampRightSidebarSize,
  isEditableTarget,
  provideRightSidebar,
  RIGHT_SIDEBAR_ABS_MAX_REM,
  RIGHT_SIDEBAR_MIN_REM,
  RIGHT_SIDEBAR_WIDE_MAX_REM,
  shouldToggleRightSidebar,
  type RightSidebarController,
  type RightSidebarPanelDef,
} from '../../packages/cms/studio-app/src/composables/useRightSidebar'

const OPEN_KEY = 'ginko-studio-right-sidebar-state'
const SIZE_KEY = 'ginko-studio-right-sidebar-size'

function installLocalStorage() {
  const values = new Map<string, string>()
  const storage = {
    get length() {
      return values.size
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  } satisfies Storage

  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
}

function installMatchMedia(isMobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      // Only the mobile query is consulted; keep everything else desktop.
      matches: query.includes('max-width: 767px') ? isMobile : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

const DummyPanel = defineComponent({ name: 'DummyPanel', render: () => h('div') })

function panelDef(overrides: Partial<RightSidebarPanelDef> = {}): RightSidebarPanelDef {
  return { title: 'Details', component: DummyPanel, ...overrides }
}

async function mountController(
  options: { path?: string; width?: number; isMobile?: boolean } = {},
) {
  installMatchMedia(options.isMobile ?? false)
  setViewportWidth(options.width ?? 1280)

  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => h('div') } },
      {
        path: '/assets',
        name: 'assets',
        meta: { rightSidebar: true },
        component: { render: () => h('div') },
      },
    ],
  })
  await router.push(options.path ?? '/')
  await router.isReady()

  let controller!: RightSidebarController
  const Harness = defineComponent({
    setup() {
      controller = provideRightSidebar()
      return () => h('div')
    },
  })
  const wrapper = mount(Harness, { global: { plugins: [router] } })
  return { controller, wrapper, router }
}

beforeEach(() => {
  vi.restoreAllMocks()
  installLocalStorage()
})

describe('clampRightSidebarSize', () => {
  it('clamps to the absolute tier bounds by default', () => {
    expect(clampRightSidebarSize(5)).toBe(RIGHT_SIDEBAR_MIN_REM)
    expect(clampRightSidebarSize(1000)).toBe(RIGHT_SIDEBAR_ABS_MAX_REM)
    expect(clampRightSidebarSize(30)).toBe(30)
  })

  it('honours explicit min/max bounds', () => {
    expect(clampRightSidebarSize(5, RIGHT_SIDEBAR_MIN_REM, RIGHT_SIDEBAR_WIDE_MAX_REM)).toBe(
      RIGHT_SIDEBAR_MIN_REM,
    )
    expect(clampRightSidebarSize(40, RIGHT_SIDEBAR_MIN_REM, RIGHT_SIDEBAR_WIDE_MAX_REM)).toBe(
      RIGHT_SIDEBAR_WIDE_MAX_REM,
    )
  })

  it('returns null for non-finite input', () => {
    expect(clampRightSidebarSize(Number.NaN)).toBeNull()
    expect(clampRightSidebarSize(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('right sidebar open preference (tri-state + defaultOpen)', () => {
  it('is closed when there is no preference and no panel default', async () => {
    const { controller } = await mountController()
    expect(controller.open.value).toBe(false)
    expect(controller.state.value).toBe('collapsed')
  })

  it('falls back to the panel defaultOpen while the preference is null', async () => {
    const { controller } = await mountController()
    controller.registerPanel(panelDef({ defaultOpen: true }))
    await nextTick()
    expect(controller.open.value).toBe(true)
    expect(controller.state.value).toBe('expanded')
  })

  it('a stored false preference wins over defaultOpen: true', async () => {
    localStorage.setItem(OPEN_KEY, 'false')
    const { controller } = await mountController()
    controller.registerPanel(panelDef({ defaultOpen: true }))
    await nextTick()
    expect(controller.open.value).toBe(false)
  })

  it('persists an explicit open preference to localStorage', async () => {
    const { controller } = await mountController()
    controller.registerPanel(panelDef({ defaultOpen: true }))
    controller.setOpen(false)
    await nextTick()
    expect(controller.open.value).toBe(false)
    expect(localStorage.getItem(OPEN_KEY)).toBe('false')

    controller.setOpen(true)
    await nextTick()
    expect(controller.open.value).toBe(true)
    expect(localStorage.getItem(OPEN_KEY)).toBe('true')
  })
})

describe('registerPanel disposal race', () => {
  it('a stale disposer never clears a newer registration', async () => {
    const { controller } = await mountController()
    const PanelA = defineComponent({ name: 'PanelA', render: () => h('div') })
    const PanelB = defineComponent({ name: 'PanelB', render: () => h('div') })

    // New page registers (B) BEFORE the old page's dispose (A) runs.
    const disposeA = controller.registerPanel(panelDef({ title: 'A', component: PanelA }))
    const disposeB = controller.registerPanel(panelDef({ title: 'B', component: PanelB }))
    expect(controller.panel.value?.component).toBe(PanelB)

    disposeA()
    expect(controller.panel.value?.component).toBe(PanelB)

    disposeB()
    expect(controller.panel.value).toBeNull()
  })
})

describe('availability = route meta OR registered panel', () => {
  it('is false without meta or a panel, and toggles with registration', async () => {
    const { controller } = await mountController({ path: '/' })
    expect(controller.available.value).toBe(false)

    const dispose = controller.registerPanel(panelDef())
    await nextTick()
    expect(controller.available.value).toBe(true)

    dispose()
    await nextTick()
    expect(controller.available.value).toBe(false)
  })

  it('is true from route meta before any panel registers', async () => {
    const { controller } = await mountController({ path: '/assets' })
    expect(controller.available.value).toBe(true)
    expect(controller.panel.value).toBeNull()
  })

  it('tracks route meta reactively across navigation', async () => {
    const { controller, router } = await mountController({ path: '/' })
    expect(controller.available.value).toBe(false)
    await router.push('/assets')
    await nextTick()
    expect(controller.available.value).toBe(true)
  })
})

describe('setSize tier clamping', () => {
  it('clamps to the wide-tier max on ≥1536px viewports', async () => {
    const { controller } = await mountController({ width: 1920 })
    controller.setSize(100)
    await nextTick()
    expect(controller.tierMaxRem()).toBe(RIGHT_SIDEBAR_WIDE_MAX_REM)
    expect(controller.sizePref.value).toBe(RIGHT_SIDEBAR_WIDE_MAX_REM)
  })

  it('clamps to the laptop-tier reserve-aware max below 1536px', async () => {
    const { controller } = await mountController({ width: 1280 })
    const max = controller.tierMaxRem()
    // 1280px tier: min(0.65*1280, 900, 1280-416)/16 = 832/16 = 52rem.
    expect(max).toBeCloseTo(52, 5)
    controller.setSize(200)
    await nextTick()
    expect(controller.sizePref.value).toBeCloseTo(max, 5)
  })

  it('resetSize returns to the responsive default (null)', async () => {
    const { controller } = await mountController({ width: 1280 })
    controller.setSize(40)
    await nextTick()
    expect(controller.sizePref.value).not.toBeNull()
    controller.resetSize()
    await nextTick()
    expect(controller.sizePref.value).toBeNull()
    expect(controller.widthVars.value.wide).toBe('20rem')
  })
})

describe('keyboard shortcut gating (shouldToggleRightSidebar)', () => {
  it('fires only with a command modifier held', () => {
    expect(shouldToggleRightSidebar({ key: '.', metaKey: true, ctrlKey: false })).toBe(true)
    expect(shouldToggleRightSidebar({ key: '.', metaKey: false, ctrlKey: true })).toBe(true)
    expect(shouldToggleRightSidebar({ key: '.', metaKey: false, ctrlKey: false })).toBe(false)
  })

  it('ignores unrelated keys (no command-palette collision)', () => {
    expect(shouldToggleRightSidebar({ key: 'k', metaKey: true, ctrlKey: false })).toBe(false)
    expect(shouldToggleRightSidebar({ key: 'b', metaKey: true, ctrlKey: false })).toBe(false)
  })

  it('never fires from a bare "." typed into an editable surface', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    for (const target of [input, textarea, editable]) {
      expect(
        shouldToggleRightSidebar({ key: '.', metaKey: false, ctrlKey: false, target }),
      ).toBe(false)
    }
    // The modifier combo still wins inside an editor (can't be typed normally).
    expect(
      shouldToggleRightSidebar({ key: '.', metaKey: true, ctrlKey: false, target: input }),
    ).toBe(true)
  })

  it('classifies editable targets', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })

  it('toggles the panel on a real Cmd+. keydown when available', async () => {
    const { controller } = await mountController({ path: '/assets' })
    expect(controller.open.value).toBe(false)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '.', metaKey: true }))
    await nextTick()
    expect(controller.open.value).toBe(true)

    // A bare '.' must not toggle.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }))
    await nextTick()
    expect(controller.open.value).toBe(true)
  })

  it('does not toggle via keyboard on routes without a panel', async () => {
    const { controller } = await mountController({ path: '/' })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '.', metaKey: true }))
    await nextTick()
    expect(controller.open.value).toBe(false)
  })
})
