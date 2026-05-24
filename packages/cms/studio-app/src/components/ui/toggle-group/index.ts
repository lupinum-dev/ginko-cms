import { type InjectionKey, inject, provide } from 'vue'

import type { ToggleVariants } from '../toggle'

export { default as ToggleGroup } from './ToggleGroup.vue'
export { default as ToggleGroupItem } from './ToggleGroupItem.vue'

export type ToggleGroupContext = {
  variant?: ToggleVariants['variant']
  size?: ToggleVariants['size']
}

export const TOGGLE_GROUP_CONTEXT = Symbol('toggleGroupContext') as InjectionKey<ToggleGroupContext>

export function provideToggleGroupContext(value: ToggleGroupContext) {
  provide(TOGGLE_GROUP_CONTEXT, value)
}

export function useToggleGroupContext(): ToggleGroupContext {
  return inject(TOGGLE_GROUP_CONTEXT, {})
}
