// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'

import FieldCheckbox from '../../packages/cms/studio-app/src/components/studio/fields/FieldCheckbox.vue'
import FieldNumber from '../../packages/cms/studio-app/src/components/studio/fields/FieldNumber.vue'
import StudioFieldShell from '../../packages/cms/studio-app/src/components/studio/StudioFieldShell.vue'
import Button from '../../packages/cms/studio-app/src/components/ui/button/Button.vue'
import Card from '../../packages/cms/studio-app/src/components/ui/card/Card.vue'
import CardContent from '../../packages/cms/studio-app/src/components/ui/card/CardContent.vue'
import CardFooter from '../../packages/cms/studio-app/src/components/ui/card/CardFooter.vue'
import CardHeader from '../../packages/cms/studio-app/src/components/ui/card/CardHeader.vue'
import CardTitle from '../../packages/cms/studio-app/src/components/ui/card/CardTitle.vue'
import Checkbox from '../../packages/cms/studio-app/src/components/ui/checkbox/Checkbox.vue'
import Field from '../../packages/cms/studio-app/src/components/ui/field/Field.vue'
import FieldContent from '../../packages/cms/studio-app/src/components/ui/field/FieldContent.vue'
import FieldDescription from '../../packages/cms/studio-app/src/components/ui/field/FieldDescription.vue'
import FieldError from '../../packages/cms/studio-app/src/components/ui/field/FieldError.vue'
import FieldLabel from '../../packages/cms/studio-app/src/components/ui/field/FieldLabel.vue'
import Input from '../../packages/cms/studio-app/src/components/ui/input/Input.vue'
import Item from '../../packages/cms/studio-app/src/components/ui/item/Item.vue'
import ItemActions from '../../packages/cms/studio-app/src/components/ui/item/ItemActions.vue'
import ItemContent from '../../packages/cms/studio-app/src/components/ui/item/ItemContent.vue'
import ItemDescription from '../../packages/cms/studio-app/src/components/ui/item/ItemDescription.vue'
import ItemGroup from '../../packages/cms/studio-app/src/components/ui/item/ItemGroup.vue'
import ItemTitle from '../../packages/cms/studio-app/src/components/ui/item/ItemTitle.vue'
import SidebarInset from '../../packages/cms/studio-app/src/components/ui/sidebar/SidebarInset.vue'
import SidebarMenuButton from '../../packages/cms/studio-app/src/components/ui/sidebar/SidebarMenuButton.vue'
import SidebarProvider from '../../packages/cms/studio-app/src/components/ui/sidebar/SidebarProvider.vue'
import {
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
} from '../../packages/cms/studio-app/src/components/ui/sidebar/utils'

describe('studio ui primitives', () => {
  it('exposes shadcn-style button sizes', () => {
    const xs = mount(Button, {
      props: { size: 'xs' },
      slots: { default: 'Extra small' },
    })
    const iconXs = mount(Button, {
      props: { size: 'icon-xs' },
      slots: { default: '<span />' },
    })

    expect(xs.attributes('data-slot')).toBe('button')
    expect(xs.attributes('data-size')).toBe('xs')
    expect(xs.attributes('class')).toContain('ginko:h-7')
    expect(iconXs.attributes('data-size')).toBe('icon-xs')
    expect(iconXs.attributes('class')).toContain('ginko:size-6')
  })

  it('uses card slots, size, and shared spacing', () => {
    const Host = defineComponent({
      components: { Card, CardContent, CardFooter, CardHeader, CardTitle },
      template: `
        <Card size="sm">
          <CardHeader>
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent>Body</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
      `,
    })

    const wrapper = mount(Host)
    const card = wrapper.get('[data-slot="card"]')

    expect(card.attributes('data-size')).toBe('sm')
    expect(card.attributes('class')).toContain('ginko:[--card-spacing:--spacing(3)]')
    expect(wrapper.get('[data-slot="card-header"]').attributes('class')).toContain(
      'ginko:px-(--card-spacing)',
    )
    expect(wrapper.get('[data-slot="card-content"]').attributes('class')).toContain(
      'ginko:px-(--card-spacing)',
    )
    expect(wrapper.get('[data-slot="card-footer"]').attributes('class')).toContain(
      'ginko:px-(--card-spacing)',
    )

    const defaultCard = mount(Card)
    expect(defaultCard.attributes('data-size')).toBe('default')
    expect(defaultCard.attributes('data-variant')).toBe('default')
  })

  it('exposes shadcn-style field state and orientation attributes', () => {
    // The refreshed template Field is a plain <div> with only `class` +
    // `orientation`; it no longer owns `invalid`/`disabled` props. Callers now
    // pass the invalid state through as a `data-invalid` attribute, which the
    // fieldVariants cva turns into `data-[invalid=true]:text-destructive`.
    const responsive = mount(Field, {
      props: { orientation: 'responsive' },
      attrs: { 'data-invalid': 'true' },
      slots: { default: 'Field body' },
    })

    expect(responsive.attributes('role')).toBe('group')
    expect(responsive.attributes('data-orientation')).toBe('responsive')
    expect(responsive.attributes('data-invalid')).toBe('true')
    expect(responsive.attributes('class')).toContain(
      'ginko:data-[invalid=true]:text-destructive',
    )
    expect(responsive.attributes('class')).toContain('ginko:@md/field-group:flex-row')
  })

  it('composes StudioFieldShell with field label, description, and error slots', () => {
    const global = {
      components: { Field, FieldDescription, FieldError, FieldLabel },
    }
    const described = mount(StudioFieldShell, {
      props: {
        description: 'Shown when valid.',
        for: 'headline',
        label: 'Headline',
        required: true,
      },
      slots: { default: '<input id="headline" />' },
      global,
    })
    const invalid = mount(StudioFieldShell, {
      props: {
        description: 'Hidden behind the error.',
        error: 'Headline is required.',
        label: 'Headline',
      },
      slots: { default: '<input />' },
      global,
    })

    expect(described.get('[data-slot="field-label"]').text()).toContain('Headline')
    expect(described.get('[data-slot="field-description"]').text()).toBe('Shown when valid.')
    expect(described.find('[data-slot="field-error"]').exists()).toBe(false)
    expect(invalid.get('[data-slot="field"]').attributes('data-invalid')).toBe('true')
    expect(invalid.get('[data-slot="field-error"]').text()).toBe('Headline is required.')
    expect(invalid.find('[data-slot="field-description"]').exists()).toBe(false)
  })

  it('renders checkbox checked, indeterminate, and invalid states', () => {
    const checked = mount(Checkbox, { props: { modelValue: true } })
    const indeterminate = mount(Checkbox, {
      props: { modelValue: 'indeterminate', 'aria-invalid': true },
    })

    expect(checked.get('[data-slot="checkbox"]').attributes('data-state')).toBe('checked')
    expect(checked.get('[data-slot="checkbox-indicator"]').exists()).toBe(true)
    expect(indeterminate.get('[data-slot="checkbox"]').attributes('data-state')).toBe(
      'indeterminate',
    )
    expect(indeterminate.get('[data-slot="checkbox"]').attributes('aria-invalid')).toBe('true')
    expect(indeterminate.get('[data-slot="checkbox"]').attributes('class')).toContain(
      'ginko:data-[state=indeterminate]:bg-primary',
    )
    expect(indeterminate.find('.lucide-minus').exists()).toBe(true)
  })

  it('composes item groups with content and actions', () => {
    const Host = defineComponent({
      components: { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle },
      template: `
        <ItemGroup>
          <Item variant="muted" size="xs">
            <ItemContent>
              <ItemTitle>Draft saved</ItemTitle>
              <ItemDescription>Two minutes ago</ItemDescription>
            </ItemContent>
            <ItemActions>
              <button type="button">Open</button>
            </ItemActions>
          </Item>
        </ItemGroup>
      `,
    })

    const wrapper = mount(Host)
    const item = wrapper.get('[data-slot="item"]')

    expect(wrapper.get('[data-slot="item-group"]').exists()).toBe(true)
    expect(item.attributes('data-size')).toBe('xs')
    expect(item.attributes('data-variant')).toBe('muted')
    expect(wrapper.get('[data-slot="item-title"]').text()).toBe('Draft saved')
    expect(wrapper.get('[data-slot="item-actions"]').text()).toBe('Open')

    const defaultItem = mount(Item)
    expect(defaultItem.attributes('data-size')).toBe('default')
    expect(defaultItem.attributes('data-variant')).toBe('default')
  })

  it('migrates representative field renderers onto canonical field slots', () => {
    const global = {
      components: {
        Checkbox,
        Field,
        FieldContent,
        FieldDescription,
        FieldError,
        FieldLabel,
        Input,
        StudioFieldShell,
      },
    }
    const number = mount(FieldNumber, {
      props: {
        field: { key: 'price', type: 'number', description: 'Displayed in USD.', required: true },
        fieldError: 'Price is required.',
        label: 'Price',
        modelValue: '',
      },
      global,
    })
    const checkbox = mount(FieldCheckbox, {
      props: {
        field: { key: 'featured', type: 'boolean', description: 'Show on the homepage.' },
        fieldError: 'Featured needs confirmation.',
        label: 'Featured',
        modelValue: false,
      },
      global,
    })

    expect(number.findAll('[data-slot="field-label"]')).toHaveLength(1)
    expect(number.findAll('[data-slot="field-error"]')).toHaveLength(1)
    expect(number.get('input').attributes('aria-invalid')).toBe('true')
    expect(checkbox.get('[data-slot="field"]').attributes('data-invalid')).toBe('true')
    expect(checkbox.get('[data-slot="checkbox"]').attributes('aria-invalid')).toBe('true')
  })

  it('renders sidebar menu active state for token-driven styling', () => {
    const Host = defineComponent({
      components: { SidebarMenuButton, SidebarProvider },
      template: `
        <SidebarProvider>
          <SidebarMenuButton :is-active="true">Content</SidebarMenuButton>
        </SidebarProvider>
      `,
    })

    const wrapper = mount(Host)
    const button = wrapper.get('[data-sidebar="menu-button"]')

    expect(button.attributes('data-active')).toBe('true')
    // Refreshed sidebarMenuButtonVariants drive the active item with the accent
    // token pair (was sidebar-primary before the template refresh).
    expect(button.attributes('class')).toContain('ginko:data-[active=true]:bg-sidebar-accent')
    expect(button.attributes('class')).toContain(
      'ginko:data-[active=true]:text-sidebar-accent-foreground',
    )
  })

  it('keeps sidebar dimensions in the provider primitives', () => {
    const wrapper = mount(SidebarProvider, {
      slots: { default: '<main>Studio</main>' },
    })
    const provider = wrapper.get('[data-slot="sidebar-wrapper"]')

    expect(provider.attributes('style')).toContain(`--sidebar-width: ${SIDEBAR_WIDTH}`)
    expect(provider.attributes('style')).toContain(`--sidebar-width-icon: ${SIDEBAR_WIDTH_ICON}`)
  })

  it('composes the sidebar inset main container', () => {
    const wrapper = mount(SidebarInset, {
      slots: { default: '<section>Workspace</section>' },
    })
    const inset = wrapper.get('[data-slot="sidebar-inset"]')

    expect(inset.text()).toBe('Workspace')
    expect(inset.attributes('class')).toContain('ginko:flex')
    expect(inset.attributes('class')).toContain('ginko:flex-col')
  })
})
