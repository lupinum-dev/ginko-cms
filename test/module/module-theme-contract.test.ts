import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const authDir = resolve(packageRoot, 'packages/cms/src/auth')
const runtimeDir = resolve(packageRoot, 'packages/cms/src/runtime')
const studioDir = resolve(packageRoot, 'packages/cms/studio-app/src')
const studioFieldsDir = resolve(studioDir, 'components/studio/fields')
const studioUiDir = resolve(studioDir, 'components/ui')

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(target) : [target]
  })
}

describe('ginko-cms theme contract', () => {
  it('does not use legacy hsl(var(--token)) runtime colors', () => {
    const offenders = [runtimeDir, studioDir, authDir]
      .flatMap((dir) => listFiles(dir))
      .filter((file) => /\.(?:css|vue)$/.test(file))
      .filter((file) => readFileSync(file, 'utf-8').includes('hsl(var(--'))

    expect(offenders).toEqual([])
  })

  it('keeps UI primitive Tailwind utilities under the ginko scope', () => {
    const exactUtilities = new Set([
      'block',
      'container',
      'flex',
      'grid',
      'hidden',
      'not-prose',
      'resize-none',
      'select-all',
      'select-auto',
      'select-none',
      'select-text',
      'sr-only',
      'truncate',
    ])
    const utilityPrefixes = [
      'animate-',
      'appearance-',
      'aspect-',
      'basis-',
      'bg-',
      'border-',
      'bottom-',
      'break-',
      'content-',
      'cursor-',
      'duration-',
      'ease-',
      'font-',
      'gap-',
      'grow-',
      'h-',
      'inline-',
      'inset-',
      'items-',
      'justify-',
      'leading-',
      'left-',
      'line-clamp-',
      'm-',
      'max-',
      'mb-',
      'min-',
      'ml-',
      'mr-',
      'mt-',
      'mx-',
      'my-',
      'object-',
      'opacity-',
      'order-',
      'origin-',
      'outline-',
      'overflow-',
      'p-',
      'pb-',
      'place-',
      'pl-',
      'pointer-events-',
      'pr-',
      'pt-',
      'px-',
      'py-',
      'resize-',
      'right-',
      'ring-',
      'rotate-',
      'rounded-',
      'scale-',
      'self-',
      'shadow-',
      'shrink-',
      'size-',
      'space-',
      'text-',
      'top-',
      'tracking-',
      'transition-',
      'translate-',
      'w-',
      'whitespace-',
      'z-',
    ]
    const isTailwindUtility = (token: string) => {
      const bareToken = token.startsWith('-') ? token.slice(1) : token
      return (
        exactUtilities.has(bareToken) ||
        utilityPrefixes.some((prefix) => bareToken.startsWith(prefix))
      )
    }
    const offenders = listFiles(studioUiDir)
      .filter((file) => /\.(?:ts|vue)$/.test(file))
      .flatMap((file) => {
        const content = readFileSync(file, 'utf-8')
        const matches = content.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/gs)
        return Array.from(matches).flatMap((match) =>
          match[2]
            .split(/\s+/)
            .filter(Boolean)
            .filter(
              (token) =>
                !token.includes('=') && isTailwindUtility(token) && !token.startsWith('ginko:'),
            )
            .map((token) => `${file}: ${token}`),
        )
      })

    expect(offenders).toEqual([])
  })

  it('keeps avoidable tiny text classes out of Studio and auth surfaces', () => {
    const allowedTinyTextFiles = new Set([resolve(studioDir, 'editor/ui/DebugPanel.vue')])
    const offenders = [studioDir, authDir]
      .flatMap((dir) => listFiles(dir))
      .filter((file) => /\.(?:css|vue|ts)$/.test(file))
      .filter((file) => !allowedTinyTextFiles.has(file))
      .flatMap((file) => {
        const content = readFileSync(file, 'utf-8')
        const matches = content.matchAll(/(?:ginko:)?text-\[(?:10|11|12|13)px\]/g)
        return Array.from(matches).map((match) => `${file}: ${match[0]}`)
      })

    expect(offenders).toEqual([])
  })

  it('keeps standard field renderers on canonical field primitives', () => {
    const offenders = listFiles(studioFieldsDir)
      .filter((file) => /\.vue$/.test(file))
      .flatMap((file) => {
        const content = readFileSync(file, 'utf-8')
        const patterns = [
          /<Label\b/g,
          /<p\s+v-if=["']fieldError["']/g,
          /fieldError\s*\?\s*['"`]ginko:border-destructive/g,
        ]
        return patterns.flatMap((pattern) =>
          Array.from(content.matchAll(pattern)).map((match) => `${file}: ${match[0]}`),
        )
      })

    expect(offenders).toEqual([])
  })

  it('does not reintroduce the deleted StudioRow path', () => {
    const offenders = [studioDir, resolve(packageRoot, 'meta'), resolve(packageRoot, 'DESIGN.md')]
      .flatMap((target) => (target.endsWith('.md') ? [target] : listFiles(target)))
      .filter((file) => /\.(?:vue|ts|md)$/.test(file))
      .filter((file) => readFileSync(file, 'utf-8').includes('StudioRow'))

    expect(offenders).toEqual([])
  })
})
