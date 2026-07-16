import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/*
 * Static contract for the Studio token system (shell-migration Phase 1).
 *
 * Parses studio-app/src/styles/index.css + themes.css and asserts the three
 * invariants the layered token merge (RFC D2 / §8.2) must never break:
 *   (a) light/dark parity        — every dark override has a light default, and
 *                                   every theme-varying (raw-color) light token
 *                                   has a dark counterpart.
 *   (b) consumer-override contract — every PUBLIC token keeps its
 *                                   var(--ginko-cms-*, …) fallback wrapper
 *                                   (the public embedding API; additive only).
 *   (c) no orphan var()          — no reference to an undefined internal token.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const stylesDir = resolve(repoRoot, 'packages/cms/studio-app/src/styles')
const indexCss = readFileSync(resolve(stylesDir, 'index.css'), 'utf-8')
const themesCss = readFileSync(resolve(stylesDir, 'themes.css'), 'utf-8')

/** Extract the flat declaration block whose body contains `anchor`. */
function blockAround(css: string, anchor: string): string {
  const anchorIndex = css.indexOf(anchor)
  if (anchorIndex < 0) throw new Error(`anchor not found: ${anchor}`)
  const open = css.lastIndexOf('{', anchorIndex)
  const close = css.indexOf('}', anchorIndex)
  return css.slice(open + 1, close)
}

/** Parse `--token: value;` declarations into a name → value map. */
function parseDecls(blockBody: string): Record<string, string> {
  const out: Record<string, string> = {}
  let offset = 0
  for (const line of blockBody.split('\n')) {
    const declaration = line.trim()
    if (declaration.startsWith('--')) {
      const separator = declaration.indexOf(':')
      const valueStart = offset + line.indexOf(':') + 1
      const end = blockBody.indexOf(';', valueStart)
      const name = declaration.slice(0, separator)
      if (separator >= 0 && end >= 0 && /^--[a-z0-9-]+$/.test(name)) {
        out[name] = blockBody.slice(valueStart, end).trim()
      }
    }
    offset += line.length + 1
  }
  return out
}

const light = parseDecls(blockAround(indexCss, 'color-scheme: light;'))
const dark = parseDecls(blockAround(indexCss, 'color-scheme: dark;'))

// A value is theme-varying when it hardcodes a color literal (not just a var()
// reference to another token, which already flips between light and dark).
const RAW_COLOR = /oklch\(|hsl\(|hsla\(|rgb\(|rgba\(|#[0-9a-fA-F]{3,8}\b/

// The public consumer-override surface — every one of these must keep its
// var(--ginko-cms-*, …) fallback. Private/internal vars (--vis-*, --color-*
// aliases, --space-*, --motion-*, --border-strong/soft/faint, --studio-shadow*,
// --primary/--primary-foreground which derive from --studio-action) are exempt.
const PUBLIC_TOKENS = [
  '--radius',
  '--studio-action',
  '--studio-action-foreground',
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--destructive-fg',
  '--success',
  '--success-foreground',
  '--success-fg',
  '--warning',
  '--warning-foreground',
  '--warning-fg',
  '--border',
  '--input',
  '--ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
  // template-parity additions (Phase 1)
  '--header-height',
  '--surface',
  '--surface-foreground',
  // studio surface / shell tokens
  '--studio-shell-bg',
  '--studio-surface',
  '--studio-panel',
  '--studio-muted',
  '--studio-divider',
]

describe('studio token contract', () => {
  it('parses both token blocks', () => {
    expect(Object.keys(light).length).toBeGreaterThan(50)
    expect(Object.keys(dark).length).toBeGreaterThan(30)
  })

  it('(a) every dark override has a light default', () => {
    const orphans = Object.keys(dark).filter((token) => !(token in light))
    expect(orphans).toEqual([])
  })

  it('(a) every theme-varying light token has a dark counterpart', () => {
    const missing = Object.keys(light).filter(
      (token) => RAW_COLOR.test(light[token]) && !(token in dark),
    )
    expect(missing).toEqual([])
  })

  it('(b) every public token keeps its var(--ginko-cms-*, …) fallback (light)', () => {
    const offenders = PUBLIC_TOKENS.filter(
      (token) => !/var\(\s*--ginko-cms-[a-z0-9-]+\s*,/.test(light[token] ?? ''),
    )
    expect(offenders).toEqual([])
  })

  it('(b) public tokens overridden in dark use the --ginko-cms-dark-* fallback', () => {
    const offenders = PUBLIC_TOKENS.filter(
      (token) => token in dark && !/var\(\s*--ginko-cms-dark-[a-z0-9-]+\s*,/.test(dark[token]),
    )
    expect(offenders).toEqual([])
  })

  it('(c) no var() reference points at an undefined internal token', () => {
    const combined = `${indexCss}\n${themesCss}`
    const defined = new Set<string>()
    for (const match of combined.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      defined.add(match[1])
    }
    // References allowed to be undefined here: consumer overrides + Tailwind's
    // prefixed theme/palette vars (both start with --ginko-), reka-ui runtime
    // vars, and host-provided font vars.
    const isExternal = (name: string) =>
      name.startsWith('--ginko-') ||
      name.startsWith('--reka-') ||
      name.startsWith('--radix-') ||
      name.startsWith('--tw-') ||
      name.startsWith('--font-') ||
      name.startsWith('--color-')

    const orphans = new Set<string>()
    for (const match of combined.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      const name = match[1]
      if (!defined.has(name) && !isExternal(name)) orphans.add(name)
    }
    expect([...orphans]).toEqual([])
  })

  it('themes.css never emits an unscoped selector (no host-app leak)', () => {
    // Every rule selector must be scoped under .ginko-cms. Catch a bare
    // `.theme-scaled {` / `.color-blue {` that would bleed into host markup.
    const offenders: string[] = []
    // Strip comments so `.color-*` mentions inside prose don't trip the check.
    const withoutComments = themesCss.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
      const selectorList = match[1].trim()
      if (!selectorList || selectorList.startsWith('@')) continue
      for (const selector of selectorList.split(',')) {
        const trimmed = selector.trim()
        if (!trimmed) continue
        if (!trimmed.includes('.ginko-cms')) offenders.push(trimmed)
      }
    }
    expect(offenders).toEqual([])
  })

  it('imports tw-animate-css and the scoped themes file', () => {
    expect(indexCss).toMatch(/@import\s+['"]tw-animate-css['"]/)
    expect(indexCss).toMatch(/@import\s+['"]\.\/themes\.css['"]/)
  })
})
