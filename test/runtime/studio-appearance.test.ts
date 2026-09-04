// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import {
  APPEARANCE_COLORS,
  APPEARANCE_STORAGE_KEY,
  useAppearance,
} from '../../packages/cms/studio-app/src/composables/useAppearance'
import { useColorMode } from '../../packages/cms/studio-app/src/composables/useColorMode'

const COLOR_MODE_STORAGE_KEY = 'ginko-cms-studio-color-mode'

describe('Studio appearance preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('[ADM-04] persists every allowed browser-local accent and light/dark/system mode while following OS changes without content writes', async () => {
    let systemDark = false
    const systemListeners = new Set<EventListener>()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)' && systemDark,
        media: query,
        onchange: null,
        addEventListener: (_event: string, listener: EventListener) =>
          systemListeners.add(listener),
        removeEventListener: (_event: string, listener: EventListener) =>
          systemListeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    const Harness = defineComponent({
      setup() {
        const appearance = useAppearance()
        const colorMode = useColorMode()
        return { appearance, colorMode, colors: APPEARANCE_COLORS }
      },
      template: `
        <div>
          <button
            v-for="color in colors"
            :key="color"
            :data-testid="'accent-' + color"
            @click="appearance.setColor(color)"
          >{{ color }}</button>
          <button data-testid="mode-light" @click="colorMode.preference = 'light'">light</button>
          <button data-testid="mode-dark" @click="colorMode.preference = 'dark'">dark</button>
          <button data-testid="mode-system" @click="colorMode.preference = 'system'">system</button>
        </div>
      `,
    })
    const wrapper = mount(Harness)

    for (const color of APPEARANCE_COLORS) {
      await wrapper.get(`[data-testid="accent-${color}"]`).trigger('click')
      expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toEqual({ color })
    }

    await wrapper.get('[data-testid="mode-dark"]').trigger('click')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark')

    await wrapper.get('[data-testid="mode-light"]').trigger('click')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('light')

    await wrapper.get('[data-testid="mode-system"]').trigger('click')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('system')

    systemDark = true
    for (const listener of systemListeners) listener(new Event('change'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    systemDark = false
    for (const listener of systemListeners) listener(new Event('change'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    expect(wrapper.html()).not.toContain('form')
    wrapper.unmount()
    expect(systemListeners.size).toBe(0)
  })
})
