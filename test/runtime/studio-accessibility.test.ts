// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import StudioAssetPicker from '../../packages/cms/studio-app/src/components/studio/StudioAssetPicker.vue'
import StudioConfirmDialog from '../../packages/cms/studio-app/src/components/studio/StudioConfirmDialog.vue'
import StudioWorkspace from '../../packages/cms/studio-app/src/components/studio/StudioWorkspace.vue'
import Button from '../../packages/cms/studio-app/src/components/ui/button/Button.vue'
import Dialog from '../../packages/cms/studio-app/src/components/ui/dialog/Dialog.vue'
import DialogContent from '../../packages/cms/studio-app/src/components/ui/dialog/DialogContent.vue'
import DialogDescription from '../../packages/cms/studio-app/src/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '../../packages/cms/studio-app/src/components/ui/dialog/DialogFooter.vue'
import DialogHeader from '../../packages/cms/studio-app/src/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '../../packages/cms/studio-app/src/components/ui/dialog/DialogTitle.vue'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({ data: ref([]) }),
}))

function dialogComponents() {
  return {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    StudioAssetBrowser: { template: '<section aria-label="Asset results">No assets.</section>' },
  }
}

async function expectNoAxeViolations(context: Element) {
  const result = await axe.run(context, {
    rules: { 'color-contrast': { enabled: false } },
  })
  expect(result.violations.map((violation) => violation.id)).toEqual([])
}

describe('Studio executable accessibility contract', () => {
  beforeEach(() => {
    const portal = document.createElement('div')
    portal.id = 'ginko-cms-studio'
    document.body.append(portal)
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('[QUA-01] keeps the workspace landmarks accessible', async () => {
    // The detail <aside> landmark moved from the workspace grid to the shell's
    // right sidebar (Phase L retired the in-card action rail); its a11y is
    // covered by the right-sidebar suite. The workspace keeps header + main.
    const wrapper = mount(StudioWorkspace, {
      attachTo: document.querySelector('#ginko-cms-studio') as HTMLElement,
      slots: {
        header: '<header><h1>Entry editor</h1></header>',
        default: '<section aria-label="Entry fields">Fields</section>',
      },
    })

    expect(wrapper.get('main').exists()).toBe(true)
    await expectNoAxeViolations(wrapper.element)
  })

  it('restores focus after closing the real asset dialog with Escape', async () => {
    const wrapper = mount(StudioAssetPicker, {
      attachTo: document.querySelector('#ginko-cms-studio') as HTMLElement,
      props: {
        assetContext: { collection: 'authors', locale: 'en' },
        kind: 'image',
        label: 'Avatar',
        modelValue: null,
      },
      global: { components: dialogComponents() },
    })
    const trigger = wrapper.get('[data-testid="studio-asset-picker-trigger"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()
    await expectNoAxeViolations(dialog as Element)

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
    )
    await flushPromises()

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('restores focus after a destructive confirmation closes', async () => {
    const Host = defineComponent({
      setup() {
        const open = ref(false)
        return () =>
          h('div', [
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  open.value = true
                },
              },
              'Delete entry',
            ),
            h(StudioConfirmDialog, {
              open: open.value,
              title: 'Delete entry?',
              description: 'This action removes the draft.',
              confirmLabel: 'Delete',
              'onUpdate:open': (value: boolean) => {
                open.value = value
              },
            }),
          ])
      },
    })
    const wrapper = mount(Host, {
      attachTo: document.querySelector('#ginko-cms-studio') as HTMLElement,
      global: { components: dialogComponents() },
    })
    const trigger = wrapper.get('button')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await nextTick()
    await flushPromises()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Delete entry?')
    await expectNoAxeViolations(dialog as Element)

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
    )
    await flushPromises()

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })
})
