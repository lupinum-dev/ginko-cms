/**
 * Unit tests for the Tailwind-prefix codemod (RFC Phase 0).
 *
 * The Studio SPA writes utilities prefix-first (`ginko:hover:bg-primary`). This
 * suite pins the transform behaviour the migration relies on: every class
 * category, non-class safety, idempotency, and a realistic `.vue` fixture drawn
 * from the template's Button component.
 */

import { describe, expect, it } from 'vitest'

import {
  checkViewportVariants,
  isViewportAllowlisted,
  isViewportScoped,
  prefixClassString,
  prefixToken,
  scanViewportVariants,
  shouldPrefixToken,
  transformScript,
  transformSource,
  transformTemplate,
} from '../../scripts/ui-shell-migration/ginkoify.mjs'

const SRC = 'packages/cms/studio-app/src'

describe('prefixToken — variant order (prefix is always first)', () => {
  it('prefixes a bare utility', () => {
    expect(prefixToken('flex')).toBe('ginko:flex')
  })

  it('keeps the prefix ahead of a single variant', () => {
    expect(prefixToken('hover:bg-primary/90')).toBe('ginko:hover:bg-primary/90')
  })

  it('keeps the prefix ahead of a stacked variant chain', () => {
    expect(prefixToken('dark:hover:bg-input/50')).toBe('ginko:dark:hover:bg-input/50')
    expect(prefixToken('dark:aria-invalid:ring-destructive/40')).toBe(
      'ginko:dark:aria-invalid:ring-destructive/40',
    )
  })

  it('keeps the prefix ahead of the negative sign', () => {
    expect(prefixToken('-mx-1')).toBe('ginko:-mx-1')
    expect(prefixToken('-translate-x-1/2')).toBe('ginko:-translate-x-1/2')
  })

  it('keeps the prefix ahead of the ! important marker', () => {
    expect(prefixToken('!px-0')).toBe('ginko:!px-0')
    expect(prefixToken('data-[variant=destructive]:*:[svg]:!text-destructive')).toBe(
      'ginko:data-[variant=destructive]:*:[svg]:!text-destructive',
    )
  })
})

describe('prefixToken — arbitrary values, data/group/peer, container queries', () => {
  it('arbitrary value utilities', () => {
    expect(prefixToken('w-[57.5vw]')).toBe('ginko:w-[57.5vw]')
    expect(prefixToken('!w-[min(calc(100vw-2rem),72rem)]')).toBe(
      'ginko:!w-[min(calc(100vw-2rem),72rem)]',
    )
    expect(prefixToken('ring-[3px]')).toBe('ginko:ring-[3px]')
  })

  it('arbitrary property utilities', () => {
    expect(prefixToken('[--gutter:2rem]')).toBe('ginko:[--gutter:2rem]')
    expect(prefixToken('[mask-type:luminance]')).toBe('ginko:[mask-type:luminance]')
  })

  it('arbitrary selector variants', () => {
    expect(prefixToken('[&_svg]:size-4')).toBe('ginko:[&_svg]:size-4')
    expect(prefixToken("[&_svg:not([class*='size-'])]:size-4")).toBe(
      "ginko:[&_svg:not([class*='size-'])]:size-4",
    )
    expect(prefixToken('[&>svg]:pointer-events-none')).toBe('ginko:[&>svg]:pointer-events-none')
  })

  it('data-* / group-data / peer variants', () => {
    expect(prefixToken('data-[state=open]:animate-in')).toBe('ginko:data-[state=open]:animate-in')
    expect(prefixToken('data-[active=true]:bg-sidebar-accent')).toBe(
      'ginko:data-[active=true]:bg-sidebar-accent',
    )
    expect(prefixToken('group-data-[collapsible=icon]:hidden')).toBe(
      'ginko:group-data-[collapsible=icon]:hidden',
    )
    expect(prefixToken('peer-disabled:opacity-50')).toBe('ginko:peer-disabled:opacity-50')
  })

  it('bare group / peer markers (with optional /name)', () => {
    expect(prefixToken('group')).toBe('ginko:group')
    expect(prefixToken('group/menu-item')).toBe('ginko:group/menu-item')
    expect(prefixToken('peer')).toBe('ginko:peer')
  })

  it('container queries — bare marker and named variant', () => {
    expect(prefixToken('@container/main')).toBe('ginko:@container/main')
    expect(prefixToken('@md/main:flex-row')).toBe('ginko:@md/main:flex-row')
    expect(prefixToken('@5xl/main:grid-cols-4')).toBe('ginko:@5xl/main:grid-cols-4')
    expect(prefixToken('@[767px]/card:hidden')).toBe('ginko:@[767px]/card:hidden')
  })

  it('fractions and slash opacity', () => {
    expect(prefixToken('w-1/2')).toBe('ginko:w-1/2')
    expect(prefixToken('bg-black/50')).toBe('ginko:bg-black/50')
    expect(prefixToken('bg-destructive/10')).toBe('ginko:bg-destructive/10')
  })

  it('multi-word roots resolve correctly', () => {
    expect(prefixToken('min-h-svh')).toBe('ginko:min-h-svh')
    expect(prefixToken('max-w-lg')).toBe('ginko:max-w-lg')
    expect(prefixToken('grid-cols-2')).toBe('ginko:grid-cols-2')
    expect(prefixToken('inset-x-0')).toBe('ginko:inset-x-0')
    expect(prefixToken('-inset-x-3')).toBe('ginko:-inset-x-3')
  })
})

describe('prefixToken — leaves non-Tailwind and already-prefixed tokens alone', () => {
  it('idempotent on already-prefixed tokens', () => {
    expect(prefixToken('ginko:flex')).toBe('ginko:flex')
    expect(prefixToken('ginko:dark:hover:bg-input/50')).toBe('ginko:dark:hover:bg-input/50')
  })

  it('leaves component / theme / non-utility classes untouched', () => {
    for (const t of ['studio-shell', 'dark', 'studio-motion-fast', 'ginko-cms', 'chevron-down']) {
      expect(prefixToken(t)).toBe(t)
    }
  })

  it('leaves cva variant identifiers untouched', () => {
    for (const t of [
      'default',
      'destructive',
      'secondary',
      'ghost',
      'link',
      'icon-sm',
      'sm',
      'lg',
    ]) {
      expect(prefixToken(t, { lone: true })).toBe(t)
    }
  })

  it('does not prefix a lone ambiguous bare word (cva variant collision guard)', () => {
    // `outline` as the entire literal is treated as a variant name, not a utility.
    expect(shouldPrefixToken('outline', { lone: true })).toBe(false)
    // …but as part of a real class list it is prefixed.
    expect(prefixClassString('outline outline-2 outline-ring', { lone: false })).toBe(
      'ginko:outline ginko:outline-2 ginko:outline-ring',
    )
  })
})

describe('prefixClassString — whitespace and mixed lists', () => {
  it('preserves whitespace runs and prefixes only utilities', () => {
    expect(prefixClassString('studio-shell relative  flex\tmin-h-svh')).toBe(
      'studio-shell ginko:relative  ginko:flex\tginko:min-h-svh',
    )
  })

  it('handles partially-prefixed lists idempotently', () => {
    expect(prefixClassString('ginko:flex items-center')).toBe('ginko:flex ginko:items-center')
  })
})

describe('static class="" attributes', () => {
  it('rewrites double- and single-quoted static class attributes', () => {
    const input = `<div class="relative flex min-h-svh"></div><p class='text-sm font-medium'></p>`
    expect(transformTemplate(input)).toBe(
      `<div class="ginko:relative ginko:flex ginko:min-h-svh"></div><p class='ginko:text-sm ginko:font-medium'></p>`,
    )
  })

  it('does not touch non-class attributes', () => {
    const input = `<div class="flex" data-testid="shell" data-state="open" id="main-panel"></div>`
    expect(transformTemplate(input)).toBe(
      `<div class="ginko:flex" data-testid="shell" data-state="open" id="main-panel"></div>`,
    )
  })

  it('does not match hyphenated attributes like active-class', () => {
    const input = `<a active-class="text-primary" class="flex"></a>`
    expect(transformTemplate(input)).toBe(`<a active-class="text-primary" class="ginko:flex"></a>`)
  })
})

describe(':class bindings — arrays, objects, ternaries', () => {
  it('rewrites string literals inside :class binding, leaving identifiers intact', () => {
    const input = `<span :class="cn('text-sm', isActive && 'bg-primary text-primary-foreground', { 'opacity-50': disabled })"></span>`
    expect(transformTemplate(input)).toBe(
      `<span :class="cn('ginko:text-sm', isActive && 'ginko:bg-primary ginko:text-primary-foreground', { 'ginko:opacity-50': disabled })"></span>`,
    )
  })

  it('rewrites v-bind:class arrays', () => {
    const input = `<b v-bind:class="[base, 'mt-2 gap-2']"></b>`
    expect(transformTemplate(input)).toBe(`<b v-bind:class="[base, 'ginko:mt-2 ginko:gap-2']"></b>`)
  })
})

describe('cn / cva / tv string literals in scripts (.ts)', () => {
  it('prefixes literals inside cn()', () => {
    expect(transformScript(`const c = cn('flex-1 outline-none', props.class)`)).toBe(
      `const c = cn('ginko:flex-1 ginko:outline-none', props.class)`,
    )
  })

  it('prefixes base + variant strings inside cva(), leaving keys/values as identifiers', () => {
    const input = `export const v = cva('inline-flex rounded-md', {
  variants: { variant: { default: 'bg-primary text-primary-foreground', 'icon-sm': 'size-8' } },
  defaultVariants: { variant: 'default' },
})`
    const out = transformScript(input)
    expect(out).toContain(`cva('ginko:inline-flex ginko:rounded-md', {`)
    expect(out).toContain(`default: 'ginko:bg-primary ginko:text-primary-foreground'`)
    expect(out).toContain(`'icon-sm': 'ginko:size-8'`)
    expect(out).toContain(`defaultVariants: { variant: 'default' }`) // untouched
  })

  it('prefixes literals inside tv()', () => {
    expect(transformScript(`const t = tv({ base: 'flex gap-2' })`)).toBe(
      `const t = tv({ base: 'ginko:flex ginko:gap-2' })`,
    )
  })

  it('leaves string literals OUTSIDE cn/cva/tv untouched (imports, i18n, ids)', () => {
    const input = `import { cn } from '@/utils'
const key = 'editor.save'
const id = 'main-panel'
const label = 'text-heavy documentation'
const c = cn('flex')`
    const out = transformScript(input)
    expect(out).toContain(`from '@/utils'`)
    expect(out).toContain(`const key = 'editor.save'`)
    expect(out).toContain(`const id = 'main-panel'`)
    expect(out).toContain(`const label = 'text-heavy documentation'`)
    expect(out).toContain(`cn('ginko:flex')`)
  })

  it('does not match method calls like foo.tv(', () => {
    expect(transformScript(`obj.tv('flex')`)).toBe(`obj.tv('flex')`)
  })
})

describe('idempotency', () => {
  const samples = [
    `<div class="relative flex -mx-1 dark:hover:bg-input/50"></div>`,
    `const c = cn('flex-1', cond && 'ginko:text-sm', 'gap-2')`,
    `<span :class="[a, 'mt-2', { 'opacity-50': x }]"></span>`,
  ]
  it.each(samples)('running twice equals running once: %s', (src) => {
    const once = transformSource(src, 'X.vue')
    const twice = transformSource(once, 'X.vue')
    expect(twice).toBe(once)
  })
})

describe('does not touch <style> blocks', () => {
  it('leaves CSS untouched', () => {
    const input = `<template><div class="flex"></div></template>
<style scoped>
.foo { display: flex; }
.bar { padding: 1rem; }
</style>`
    const out = transformSource(input, 'X.vue')
    expect(out).toContain(`class="ginko:flex"`)
    expect(out).toContain(`.foo { display: flex; }`)
    expect(out).toContain(`.bar { padding: 1rem; }`)
  })
})

describe('viewport-variant guard — content must use container queries', () => {
  it('scans out viewport variants but never container-query variants', () => {
    expect(scanViewportVariants('<div class="ginko:md:flex-row ginko:sm:grid-cols-2">')).toEqual([
      'ginko:md:flex-row',
      'ginko:sm:grid-cols-2',
    ])
    expect(scanViewportVariants('ginko:2xl:hidden ginko:xl:min-h-[400px]')).toEqual([
      'ginko:2xl:hidden',
      'ginko:xl:min-h-[400px]',
    ])
    // Container-query variants (the desired form) are left alone.
    expect(
      scanViewportVariants('ginko:@2xl:flex ginko:@3xl:grid-cols-2 ginko:@container/main'),
    ).toEqual([])
    // The bare prefixed utility (no viewport variant) is not a hit.
    expect(scanViewportVariants('ginko:flex ginko:md-heading')).toEqual([])
  })

  it('flags a synthetic offender in a Studio content component', () => {
    const hits = checkViewportVariants(
      `${SRC}/components/studio/settings/StudioSettingsSyntheticSection.vue`,
      '<div class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10"></div>',
    )
    expect(hits).toEqual(['ginko:md:flex-row', 'ginko:md:gap-10'])
  })

  it('flags a synthetic offender in a Studio page', () => {
    expect(
      checkViewportVariants(
        `${SRC}/pages/synthetic.vue`,
        '<div class="ginko:lg:grid-cols-2"></div>',
      ),
    ).toEqual(['ginko:lg:grid-cols-2'])
  })

  it('accepts shell-chrome allowlisted files (named + prefix + dir)', () => {
    const offending = '<div class="ginko:md:hidden ginko:lg:w-64"></div>'
    // Named entries.
    expect(checkViewportVariants(`${SRC}/components/studio/StudioHeader.vue`, offending)).toEqual(
      [],
    )
    expect(
      checkViewportVariants(`${SRC}/components/studio/StudioEntryTopBar.vue`, offending),
    ).toEqual([])
    // StudioSidebar*.vue prefix rule.
    expect(
      checkViewportVariants(`${SRC}/components/studio/StudioSidebarNav.vue`, offending),
    ).toEqual([])
    // components/studio/layout/** dir rule (reserved frame primitives).
    expect(
      checkViewportVariants(`${SRC}/components/studio/layout/StudioFrame.vue`, offending),
    ).toEqual([])
  })

  it('accepts justified-viewport allowlisted files (overlays, page frame, master-detail)', () => {
    const offending = '<div class="ginko:sm:max-w-lg"></div>'
    for (const rel of [
      'components/studio/StudioPageBody.vue',
      'components/studio/StudioPageHeader.vue',
      'components/studio/StudioConfirmDialog.vue',
      'components/studio/StudioGlobalPrompt.vue',
      'components/studio/editor/StudioPublishDialog.vue',
      'components/studio/assets/StudioAssetMobileFilters.vue',
      'components/studio/assets/StudioAssetMobileScopes.vue',
      'components/studio/collections/StudioCollectionsListPanel.vue',
      'pages/collections.vue',
      'pages/reviews.vue',
      'pages/[collection]/index.vue',
    ]) {
      expect(checkViewportVariants(`${SRC}/${rel}`, offending)).toEqual([])
      expect(isViewportAllowlisted(`${SRC}/${rel}`)).toBe(true)
    }
  })

  it('scopes the guard to Studio content surfaces only', () => {
    // Vendored primitives and the app frame are out of scope.
    expect(isViewportScoped(`${SRC}/components/ui/button/Button.vue`)).toBe(false)
    expect(isViewportScoped(`${SRC}/components/layout/RightSidebar.vue`)).toBe(false)
    // Studio content and pages are in scope.
    expect(
      isViewportScoped(`${SRC}/components/studio/settings/StudioSettingsMembersSection.vue`),
    ).toBe(true)
    expect(isViewportScoped(`${SRC}/pages/agents.vue`)).toBe(true)
    // Out-of-scope files are never flagged, even with a viewport variant present.
    expect(
      checkViewportVariants(
        `${SRC}/components/ui/button/Button.vue`,
        '<i class="ginko:md:flex"></i>',
      ),
    ).toEqual([])
  })
})

describe('realistic full .vue fixture (template Button component)', () => {
  // Snippet adapted from nuxt-shadcn-dashboard-template Button.vue + its cva.
  const fixture = `<script setup lang="ts">
import { Primitive } from 'reka-ui'
import { cva } from 'class-variance-authority'
import { cn } from '@/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        outline: 'border bg-background hover:bg-accent dark:bg-input/30',
      },
      size: {
        default: 'h-9 px-4 py-2',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
</script>

<template>
  <Primitive
    data-slot="button"
    class="relative isolate"
    :class="cn(buttonVariants({ variant, size }), 'gap-1.5', props.class)"
  >
    <slot />
  </Primitive>
</template>`

  it('prefixes every utility, everywhere, once', () => {
    const out = transformSource(fixture, 'Button.vue')

    // cva base string
    expect(out).toContain('ginko:inline-flex ginko:items-center ginko:justify-center ginko:gap-2')
    expect(out).toContain("ginko:[&_svg:not([class*='size-'])]:size-4")
    expect(out).toContain('ginko:dark:aria-invalid:ring-destructive/40')
    // cva variant strings
    expect(out).toContain(
      `default: 'ginko:bg-primary ginko:text-primary-foreground ginko:shadow-xs ginko:hover:bg-primary/90'`,
    )
    expect(out).toContain(
      `outline: 'ginko:border ginko:bg-background ginko:hover:bg-accent ginko:dark:bg-input/30'`,
    )
    expect(out).toContain(`'icon-sm': 'ginko:size-8'`)
    // cva keys / defaults untouched
    expect(out).toContain(`defaultVariants: { variant: 'default', size: 'default' }`)
    expect(out).toContain(`size: {`)
    // static class attr
    expect(out).toContain(`class="ginko:relative ginko:isolate"`)
    // :class binding — literal prefixed, expression intact
    expect(out).toContain(
      `:class="cn(buttonVariants({ variant, size }), 'ginko:gap-1.5', props.class)"`,
    )
    // non-class literals untouched
    expect(out).toContain(`data-slot="button"`)
    expect(out).toContain(`from 'reka-ui'`)
    expect(out).toContain(`from '@/utils'`)

    // idempotent
    expect(transformSource(out, 'Button.vue')).toBe(out)
  })
})
