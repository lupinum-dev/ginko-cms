/**
 * A minimal, test-only stand-in for Nuxt's `#imports` auto-import virtual
 * module. Vite's SSR import-analysis resolves `#imports` eagerly (it fails
 * fast with "Failed to resolve import" before `vi.mock('#imports', ...)`
 * gets a chance to shadow it for `.vue` SFCs compiled through
 * `@vitejs/plugin-vue`), so component tests that mount Nuxt-flavored SFCs
 * need a real, aliasable module to resolve against. This file is aliased to
 * `#imports` in `vitest.config.ts` and re-exports plain Vue reactivity
 * primitives plus test-controllable stubs for the handful of Nuxt composables
 * Ginko's components call. Individual tests still use `vi.mock('#imports', ...)`
 * to override the composable stubs (`useConvexAuth`, `navigateTo`, `useRoute`,
 * etc.) with per-test fakes; this shim only exists so that resolution never
 * fails for `.vue` files that don't get their own `vi.mock('#imports', ...)`.
 */
export {
  computed,
  isRef,
  reactive,
  readonly,
  ref,
  shallowRef,
  toRef,
  toRefs,
  unref,
  watch,
  watchEffect,
  onMounted,
  onScopeDispose,
  onUnmounted,
} from 'vue'

export function navigateTo(): void {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] navigateTo was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useRoute(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useRoute was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useRouter(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useRouter was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useConvexAuth(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useConvexAuth was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useConvexConfig(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useConvexConfig was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useConvex(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useConvex was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useRuntimeConfig(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useRuntimeConfig was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useRequestURL(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useRequestURL was called without a per-test vi.mock("#imports", ...) override.',
  )
}

export function useHead(): void {
  // A no-op default is safe: head-tag injection has no observable effect in
  // a unit-mounted component test unless a test asserts on it directly.
}

export function useCookie(): { value: unknown } {
  return { value: undefined }
}

export function useNuxtApp(): never {
  throw new Error(
    '[test/helpers/nuxt-imports-shim] useNuxtApp was called without a per-test vi.mock("#imports", ...) override.',
  )
}
