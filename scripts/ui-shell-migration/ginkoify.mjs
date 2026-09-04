#!/usr/bin/env node
/**
 * ginkoify — Tailwind-prefix codemod for the Studio shell migration (RFC Phase 0).
 *
 * The Studio SPA imports Tailwind as `@import 'tailwindcss' prefix(ginko)`, so every
 * utility is written PREFIX-FIRST: the `ginko:` prefix leads the whole token, then any
 * variants, then the utility itself (including the `!` important marker and negative `-`).
 *
 *   template (unprefixed)              studio (prefixed)
 *   ---------------------------------  ------------------------------------
 *   flex                               ginko:flex
 *   hover:bg-primary/90                ginko:hover:bg-primary/90
 *   dark:hover:bg-input/50             ginko:dark:hover:bg-input/50
 *   data-[state=open]:animate-in       ginko:data-[state=open]:animate-in
 *   -mx-1                              ginko:-mx-1
 *   !px-0                              ginko:!px-0
 *   @container/main                    ginko:@container/main
 *   @md/main:flex-row                  ginko:@md/main:flex-row
 *   [&_svg]:size-4                     ginko:[&_svg]:size-4
 *
 * We only rewrite genuine Tailwind utilities (matched against a conservative
 * allowlist of utility roots). Non-utility tokens — component classes like
 * `studio-shell`, cva variant names, the bare `dark` theme class, i18n keys,
 * ids, data-testids, import paths — are left untouched. Running the codemod
 * twice is a no-op (idempotent), because already-`ginko:`-prefixed tokens are skipped.
 *
 * Usage:
 *   node scripts/ui-shell-migration/ginkoify.mjs <file-or-dir>...   # rewrite in place
 *   node scripts/ui-shell-migration/ginkoify.mjs --dry <path>...    # print a diff, write nothing
 *   node scripts/ui-shell-migration/ginkoify.mjs --check <path>...  # exit 1 if unprefixed utilities remain
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PREFIX = 'ginko:'

/**
 * Utility ROOTS: the namespace that leads a Tailwind utility (`bg-…`, `text-…`,
 * `grid-cols-…`), plus every standalone/bare utility (`flex`, `hidden`, `truncate`).
 * A token is prefixed only if its utility segment starts with one of these roots
 * (longest leading match wins) OR is an arbitrary utility (`[…]`) OR an `@container`
 * marker. This is deliberately allowlist-based, not prefix-everything.
 */
export const ROOTS = new Set([
  // --- Layout ---
  'aspect',
  'container',
  'columns',
  'break',
  'box',
  'box-decoration',
  'float',
  'clear',
  'isolate',
  'isolation',
  'object',
  'overflow',
  'overscroll',
  'z',
  'static',
  'fixed',
  'absolute',
  'relative',
  'sticky',
  'inset',
  'inset-x',
  'inset-y',
  'start',
  'end',
  'top',
  'right',
  'bottom',
  'left',
  'visible',
  'invisible',
  'collapse',
  'hidden',
  'block',
  'inline',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'table',
  'inline-table',
  'contents',
  'flow-root',
  'list-item',
  'sr-only',
  'not-sr-only',
  // --- Flexbox / Grid ---
  'basis',
  'grow',
  'shrink',
  'order',
  'grid-cols',
  'grid-rows',
  'grid-flow',
  'auto-cols',
  'auto-rows',
  'col',
  'col-span',
  'col-start',
  'col-end',
  'row',
  'row-span',
  'row-start',
  'row-end',
  'gap',
  'gap-x',
  'gap-y',
  'justify',
  'justify-items',
  'justify-self',
  'content',
  'items',
  'self',
  'place',
  'place-content',
  'place-items',
  'place-self',
  // --- Spacing ---
  'p',
  'px',
  'py',
  'ps',
  'pe',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'ms',
  'me',
  'mt',
  'mr',
  'mb',
  'ml',
  'space',
  'space-x',
  'space-y',
  // --- Sizing ---
  'w',
  'min-w',
  'max-w',
  'h',
  'min-h',
  'max-h',
  'size',
  // --- Typography ---
  'font',
  'text',
  'tracking',
  'leading',
  'list',
  'placeholder',
  'decoration',
  'underline',
  'overline',
  'line-through',
  'no-underline',
  'underline-offset',
  'indent',
  'align',
  'whitespace',
  'hyphens',
  'wrap',
  'uppercase',
  'lowercase',
  'capitalize',
  'normal-case',
  'truncate',
  'italic',
  'not-italic',
  'antialiased',
  'subpixel-antialiased',
  'ordinal',
  'slashed-zero',
  'lining-nums',
  'oldstyle-nums',
  'proportional-nums',
  'tabular-nums',
  'diagonal-fractions',
  'stacked-fractions',
  'normal-nums',
  'field-sizing',
  // --- Backgrounds ---
  'bg',
  'from',
  'via',
  'to',
  // --- Borders ---
  'border',
  'border-x',
  'border-y',
  'border-s',
  'border-e',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'rounded',
  'divide',
  'divide-x',
  'divide-y',
  'outline',
  'outline-offset',
  'ring',
  'ring-offset',
  // --- Effects / Filters ---
  'shadow',
  'inset-shadow',
  'opacity',
  'mix-blend',
  'bg-blend',
  'blur',
  'brightness',
  'contrast',
  'drop-shadow',
  'grayscale',
  'hue-rotate',
  'invert',
  'saturate',
  'sepia',
  'filter',
  'backdrop',
  'backdrop-blur',
  'backdrop-brightness',
  'backdrop-contrast',
  'backdrop-grayscale',
  'backdrop-hue-rotate',
  'backdrop-invert',
  'backdrop-opacity',
  'backdrop-saturate',
  'backdrop-sepia',
  'mask',
  'mask-image',
  'mask-mode',
  // --- Tables ---
  'border-collapse',
  'border-separate',
  'border-spacing',
  'table-auto',
  'table-fixed',
  'caption',
  // --- Transitions / Animation ---
  'transition',
  'duration',
  'ease',
  'delay',
  'animate',
  'will-change',
  // --- Transforms ---
  'scale',
  'scale-x',
  'scale-y',
  'scale-z',
  'rotate',
  'rotate-x',
  'rotate-y',
  'translate',
  'translate-x',
  'translate-y',
  'translate-z',
  'skew',
  'skew-x',
  'skew-y',
  'transform',
  'origin',
  'perspective',
  'backface',
  // --- Interactivity ---
  'accent',
  'appearance',
  'cursor',
  'caret',
  'pointer-events',
  'resize',
  'scroll',
  'scroll-m',
  'scroll-mx',
  'scroll-my',
  'scroll-mt',
  'scroll-mr',
  'scroll-mb',
  'scroll-ml',
  'scroll-p',
  'scroll-px',
  'scroll-py',
  'scroll-pt',
  'scroll-pr',
  'scroll-pb',
  'scroll-pl',
  'snap',
  'touch',
  'select',
  'forced-color-adjust',
  // --- SVG ---
  'fill',
  'stroke',
  // --- Groups / peers (bare markers) ---
  'group',
  'peer',
])

/**
 * Bare, single-word utilities that are unambiguously Tailwind when written alone
 * (`class="relative flex"`). These are already in ROOTS; the set below is only used
 * to gate LONE string literals inside JS (`:class` / cn / cva / tv), where a bare word
 * like `'outline'` is more likely a cva variant name than the `outline` utility.
 * We keep this exclusion tiny — only words that realistically collide with shadcn
 * cva variant identifiers.
 */
const AMBIGUOUS_LONE = new Set(['outline'])

/** Strip a leading `!` (important) then a single leading `-` (negative). */
function stripSigns(u) {
  let s = u
  if (s.startsWith('!')) s = s.slice(1)
  if (s.startsWith('-')) s = s.slice(1)
  return s
}

/**
 * Split a class token into `:`-separated segments, ignoring `:` inside `[...]`
 * (arbitrary values/variants) so `data-[state=open]:flex` → ['data-[state=open]', 'flex'].
 */
function splitVariants(token) {
  const parts = []
  let buf = ''
  let depth = 0
  for (const ch of token) {
    if (ch === '[') depth++
    else if (ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ':' && depth === 0) {
      parts.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  parts.push(buf)
  return parts
}

/** Is the final (utility) segment a recognized Tailwind utility? */
function isRecognizedUtility(utilSegment) {
  const base = stripSigns(utilSegment)
  if (!base) return false
  if (base[0] === '[') return true // arbitrary property, e.g. [mask-type:luminance]
  if (base.startsWith('@container')) return true // container marker, e.g. @container/main
  if (/^(?:group|peer)(?:\/|$)/.test(base)) return true // named marker, e.g. group/menu-item
  const segs = base.split('-')
  for (let k = 1; k <= Math.min(4, segs.length); k++) {
    const root = segs.slice(0, k).join('-')
    if (ROOTS.has(root)) return true
    // Stop extending the root once we reach a value-ish segment
    // (numbers, fractions, arbitrary brackets): `bg-black/45`, `w-[57.5vw]`.
    if (/[[\d/]/.test(segs[k - 1])) break
  }
  return false
}

/**
 * Decide whether a single class token should receive the `ginko:` prefix.
 * `lone` = the token is the entire content of a JS string literal (guards cva
 * variant-name collisions like a bare `'outline'`).
 */
export function shouldPrefixToken(token, { lone = false } = {}) {
  if (!token) return false
  if (token.startsWith(PREFIX)) return false // already prefixed → idempotent
  const parts = splitVariants(token)
  const util = parts[parts.length - 1]
  if (!isRecognizedUtility(util)) return false
  if (lone && parts.length === 1) {
    const base = stripSigns(util)
    if (AMBIGUOUS_LONE.has(base)) return false
  }
  return true
}

/** Prefix a single token if it is a utility, else return it unchanged. */
export function prefixToken(token, opts = {}) {
  return shouldPrefixToken(token, opts) ? PREFIX + token : token
}

/**
 * Rewrite a whitespace-separated class string, preserving the original
 * whitespace runs. `lone` is derived per whole-string (a single-token string).
 */
export function prefixClassString(str, { lone = false } = {}) {
  // Split into [token, ws, token, ws, …] preserving separators.
  const pieces = str.split(/(\s+)/)
  const tokenCount = pieces.filter((p, i) => i % 2 === 0 && p !== '').length
  const isLone = lone && tokenCount === 1
  return pieces
    .map((piece, i) => {
      if (i % 2 === 1) return piece // whitespace run
      if (piece === '') return piece
      return prefixToken(piece, { lone: isLone })
    })
    .join('')
}

/**
 * Walk `code`, find every JS string literal, and replace its contents with
 * `xf(content)`. Handles single/double quotes and comments. Static template
 * literals (backticks with no `${…}`) are transformed; interpolated template
 * literals are left untouched (documented limitation).
 */
function mapStringLiterals(code, xf) {
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    // line comment
    if (c === '/' && code[i + 1] === '/') {
      let j = i
      while (j < n && code[j] !== '\n') j++
      out += code.slice(i, j)
      i = j
      continue
    }
    // block comment
    if (c === '/' && code[i + 1] === '*') {
      let j = i + 2
      while (j < n && !(code[j] === '*' && code[j + 1] === '/')) j++
      j = Math.min(n, j + 2)
      out += code.slice(i, j)
      i = j
      continue
    }
    // single / double quoted string
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let content = ''
      let terminated = false
      while (j < n) {
        const cj = code[j]
        if (cj === '\\') {
          content += cj + (code[j + 1] ?? '')
          j += 2
          continue
        }
        if (cj === quote) {
          terminated = true
          break
        }
        if (cj === '\n') break // unterminated safety — bail
        content += cj
        j++
      }
      if (terminated) {
        out += quote + xf(content) + quote
        i = j + 1
      } else {
        out += code.slice(i, j)
        i = j
      }
      continue
    }
    // template literal
    if (c === '`') {
      let j = i + 1
      let content = ''
      let terminated = false
      let interpolated = false
      while (j < n) {
        const cj = code[j]
        if (cj === '\\') {
          content += cj + (code[j + 1] ?? '')
          j += 2
          continue
        }
        if (cj === '`') {
          terminated = true
          break
        }
        if (cj === '$' && code[j + 1] === '{') {
          interpolated = true
        }
        content += cj
        j++
      }
      if (terminated && !interpolated) {
        out += '`' + xf(content) + '`'
        i = j + 1
      } else {
        // interpolated or unterminated → leave verbatim
        out += code.slice(i, terminated ? j + 1 : j)
        i = terminated ? j + 1 : j
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Find the matching close paren for the `(` at `open`, string/comment aware.
 * Returns the index of the matching `)` or -1.
 */
function matchParen(code, open) {
  let depth = 0
  let i = open
  const n = code.length
  while (i < n) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i++
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < n) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === quote) break
        i++
      }
      i++
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

const CALL_RE = /(^|[^\w$.])(?:cn|cva|tv)\s*\(/g

/**
 * Transform a JS/TS source (a `.ts` file or a `.vue` <script> block): rewrite
 * class string literals only inside `cn(...)`, `cva(...)`, and `tv(...)` calls.
 * String literals elsewhere (imports, i18n keys, ids) are left untouched.
 */
export function transformScript(code) {
  let out = ''
  let cursor = 0
  CALL_RE.lastIndex = 0
  let m
  while ((m = CALL_RE.exec(code)) !== null) {
    const callStart = m.index + m[1].length
    const openParen = code.indexOf('(', callStart)
    if (openParen === -1 || openParen < cursor) continue
    const close = matchParen(code, openParen)
    if (close === -1) continue
    if (openParen < cursor) continue
    out += code.slice(cursor, openParen + 1)
    const inner = code.slice(openParen + 1, close)
    out += mapStringLiterals(inner, (s) => prefixClassString(s, { lone: true }))
    out += ')'
    cursor = close + 1
    CALL_RE.lastIndex = cursor
  }
  out += code.slice(cursor)
  return out
}

// Attribute matchers for the Vue template region.
// Bindings: `:class="…"` and `v-bind:class="…"`.
const BIND_CLASS_RE = /(v-bind:class|:class)=(["'])([\s\S]*?)\2/g
// Static: `class="…"`, but NOT when preceded by `:`, `-`, or a word char
// (so it never re-matches `:class`, `v-bind:class`, or `active-class`).
const STATIC_CLASS_RE = /(?<![:\-\w])class=(["'])([\s\S]*?)\1/g

/**
 * Transform a Vue <template> region: static `class="…"` values are rewritten
 * wholesale; `:class` / `v-bind:class` binding expressions have their string
 * literals rewritten (covers arrays, objects, ternaries, and inline cn(...)).
 */
export function transformTemplate(html) {
  // Bindings first (their JS string literals only).
  let out = html.replace(BIND_CLASS_RE, (_full, name, q, expr) => {
    const rewritten = mapStringLiterals(expr, (s) => prefixClassString(s, { lone: true }))
    return `${name}=${q}${rewritten}${q}`
  })
  // Static class attributes (whole value is a class list).
  out = out.replace(STATIC_CLASS_RE, (_full, q, value) => {
    return `class=${q}${prefixClassString(value, { lone: false })}${q}`
  })
  return out
}

/** Split a .vue SFC into ordered regions so <style> is never touched. */
function transformVue(source) {
  const blockRe = /(<script\b[\s\S]*?<\/script>)|(<template\b[\s\S]*?<\/template>)/gi
  let out = ''
  let cursor = 0
  let m
  while ((m = blockRe.exec(source)) !== null) {
    out += source.slice(cursor, m.index)
    if (m[1]) {
      // <script> … </script>
      const open = m[1].indexOf('>') + 1
      const inner = m[1].slice(open, m[1].length - '</script>'.length)
      out += m[1].slice(0, open) + transformScript(inner) + '</script>'
    } else {
      // <template> … </template>
      const open = m[2].indexOf('>') + 1
      const inner = m[2].slice(open, m[2].length - '</template>'.length)
      out += m[2].slice(0, open) + transformTemplate(inner) + '</template>'
    }
    cursor = m.index + m[0].length
  }
  out += source.slice(cursor)
  return out
}

/** Transform a source string by file kind. */
export function transformSource(source, filename = '') {
  if (filename.endsWith('.vue')) return transformVue(source)
  // .ts / .mts / .cts / .js / .mjs
  return transformScript(source)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function collectFiles(paths) {
  const files = []
  const exts = ['.vue', '.ts', '.mts', '.cts', '.tsx']
  const skipDirs = new Set(['node_modules', '.git', 'dist', '.nuxt', '.output'])
  const walk = (p) => {
    const st = statSync(p)
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) {
        if (skipDirs.has(entry)) continue
        walk(join(p, entry))
      }
    } else if (exts.some((e) => p.endsWith(e))) {
      files.push(p)
    }
  }
  for (const p of paths) walk(p)
  return files
}

/** Minimal per-line unified-style diff of changed lines. */
function lineDiff(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  const lines = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) lines.push(`  - ${a[i]}`)
      if (b[i] !== undefined) lines.push(`  + ${b[i]}`)
    }
  }
  return lines
}

// ---------------------------------------------------------------------------
// Viewport-variant guard
// ---------------------------------------------------------------------------
// Studio design-system rule: CONTENT components respond to the width of their
// content PANE, not the browser viewport — the sidebar and right rail change the
// pane width independently of the viewport. So content must use container-query
// variants (`ginko:@2xl:` …), never viewport variants (`ginko:md:` …). This guard
// flags viewport variants that leak into Studio content surfaces.

/**
 * Matches a Tailwind VIEWPORT variant written prefix-first: the `ginko:` prefix
 * immediately followed by a viewport breakpoint (`sm|md|lg|xl|2xl`). Container-query
 * variants (`ginko:@2xl:` …) are deliberately NOT matched — the leading `@` breaks
 * the `ginko:<bp>` adjacency this pattern requires.
 */
const VIEWPORT_VARIANT_RE = /ginko:(?:sm|md|lg|xl|2xl):[^\s"'`]*/g

/** Every viewport-variant class token in `source` (raw text scan). */
export function scanViewportVariants(source) {
  return source.match(VIEWPORT_VARIANT_RE) ?? []
}

/**
 * The guard applies only to Studio CONTENT surfaces: `components/studio/**` and
 * `pages/**` under the studio-app. Vendored primitives (`components/ui/**`, which
 * keep 1:1 template parity) and the app frame (`components/layout/**`) are out of
 * scope by design.
 */
export function isViewportScoped(path) {
  const p = path.replace(/\\/g, '/')
  return p.includes('/components/studio/') || p.includes('/pages/')
}

/**
 * Files where a VIEWPORT variant is the correct tool and a container query cannot
 * serve. Kept as an explicit list so every entry carries its reason. A container
 * query needs an `@container` ancestor in the SAME document subtree; the exceptions
 * below either establish no such ancestor or are portalled out of every container.
 */
const VIEWPORT_ALLOWLIST_DIR = 'components/studio/layout/'
const VIEWPORT_ALLOWLIST_PREFIX = 'components/studio/StudioSidebar'
const VIEWPORT_ALLOWLIST_FILES = new Set([
  // --- Shell chrome: the app frame legitimately tracks the VIEWPORT, not a pane.
  //     (StudioSidebar*.vue and components/studio/layout/** are matched by the
  //     prefix/dir rules above.) ---
  'components/studio/StudioHeader.vue',
  'components/studio/StudioEntryTopBar.vue',

  // --- Page-frame primitives: the `p-4 lg:p-6` / `lg:px-6` padding rhythm is
  //     deliberately viewport-based for 1:1 parity with the dashboard template, and
  //     StudioPageHeader renders in the workspace header slot OUTSIDE @container/main,
  //     so header and body cannot share a content container. ---
  'components/studio/StudioPageBody.vue',
  'components/studio/StudioPageHeader.vue',

  // --- Teleported overlays: Dialog/Sheet content portals to the <body> root,
  //     outside every @container, so its max-width tracks the viewport (mirroring
  //     the DialogContent primitive's own `sm:` width). Only the width override on
  //     the teleported node remains viewport-based here — grids INSIDE the dialog
  //     were converted to `@`-queries against DialogContent's own @container. ---
  'components/studio/StudioConfirmDialog.vue',
  'components/studio/StudioGlobalPrompt.vue',
  'components/studio/editor/StudioPublishDialog.vue',
  'pages/reviews.vue',

  // --- Teleported mobile sheets: shown only on small viewports; the Sheet portals
  //     outside @container, so the viewport is the only signal reachable. ---
  'components/studio/assets/StudioAssetMobileFilters.vue',
  'components/studio/assets/StudioAssetMobileScopes.vue',

  // --- Master-detail split: the collections list/detail split spans the whole
  //     content pane and toggles panes on the viewport; the list pane mirrors the
  //     same `lg` breakpoint (and carries the `lg:px-6` padding rhythm). ---
  'pages/collections.vue',
  'components/studio/collections/StudioCollectionsListPanel.vue',

  // --- Content-list route: residual `lg:px-6` is the page-padding rhythm (above);
  //     the toolbar search basis was converted to an `@`-query. ---
  'pages/[collection]/index.vue',
])

/** True if `path` is exempt from the viewport-variant guard. */
export function isViewportAllowlisted(path) {
  const p = path.replace(/\\/g, '/')
  if (p.includes(VIEWPORT_ALLOWLIST_DIR)) return true
  if (p.includes(VIEWPORT_ALLOWLIST_PREFIX)) return true
  for (const f of VIEWPORT_ALLOWLIST_FILES) if (p.endsWith(f)) return true
  return false
}

/**
 * Guard a single file: returns the viewport-variant tokens that should have been
 * container queries. Empty when the file is out of scope, allowlisted, or clean.
 */
export function checkViewportVariants(path, source) {
  if (!isViewportScoped(path)) return []
  if (isViewportAllowlisted(path)) return []
  return scanViewportVariants(source)
}

function main(argv) {
  const args = argv.slice(2)
  const dry = args.includes('--dry')
  const check = args.includes('--check')
  const paths = args.filter((a) => !a.startsWith('--'))
  if (paths.length === 0) {
    console.error(
      'Usage: node scripts/ui-shell-migration/ginkoify.mjs [--dry|--check] <file-or-dir>...',
    )
    process.exit(2)
  }

  const files = collectFiles(paths)
  let changedCount = 0
  const offenders = []
  const viewportOffenders = []

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (check) {
      const vv = checkViewportVariants(file, source)
      if (vv.length > 0) viewportOffenders.push({ file, classes: [...new Set(vv)] })
    }
    const out = transformSource(source, file)
    if (out === source) continue
    changedCount++
    if (check) {
      offenders.push(file)
      continue
    }
    if (dry) {
      console.log(`\n${file}`)
      for (const line of lineDiff(source, out)) console.log(line)
    } else {
      writeFileSync(file, out)
      console.log(`ginkoified ${file}`)
    }
  }

  if (check) {
    let failed = false
    if (offenders.length > 0) {
      console.error(`\n${offenders.length} file(s) contain unprefixed Tailwind utilities:`)
      for (const f of offenders) console.error(`  ${f}`)
      console.error('\nRun: node scripts/ui-shell-migration/ginkoify.mjs <paths>')
      failed = true
    }
    if (viewportOffenders.length > 0) {
      console.error(
        `\n${viewportOffenders.length} Studio content file(s) use viewport variants where the` +
          ' design system requires container queries (ginko:@2xl:/@3xl:/@5xl:/@7xl: …):',
      )
      for (const { file, classes } of viewportOffenders) {
        console.error(`  ${file}\n    ${classes.join(' ')}`)
      }
      console.error(
        '\nConvert each to a container-query variant, or — if the class genuinely tracks the' +
          ' viewport (teleported overlay, shell chrome) — add the file to VIEWPORT_ALLOWLIST_FILES' +
          ' with a justification.',
      )
      failed = true
    }
    if (failed) process.exit(1)
    console.log(`ginkoify --check: ${files.length} file(s) clean`)
    return
  }

  const verb = dry ? 'would change' : 'changed'
  console.log(`\nginkoify: ${verb} ${changedCount} of ${files.length} file(s)`)
}

// Run only when invoked directly (not when imported by tests).
const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).pathname : ''
if (invokedPath === new URL(import.meta.url).pathname) {
  main(process.argv)
}
