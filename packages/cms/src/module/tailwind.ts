/**
 * Tailwind CSS v4 source injection plugin.
 *
 * Tailwind CSS v4 uses `@source` directives (placed after `@import "tailwindcss"`)
 * to tell the compiler where to scan for utility classes. This Vite plugin
 * automatically injects an `@source` directive pointing at the CMS module's
 * runtime directory so that Tailwind picks up all classes used by studio
 * components — without requiring the host app to configure source paths manually.
 *
 * This approach is specific to Tailwind CSS v4 and its `@source` / `@import`
 * pattern. It will need to be revisited if a future major version changes the
 * configuration surface.
 */
import { relative, dirname } from 'node:path'

import MagicString from 'magic-string'
import type { Plugin } from 'vite'

const TAILWIND_DARK_VARIANT = '@custom-variant dark (&:where(.dark, .dark *));'

function toTailwindSourcePath(fromCssPath: string, sourcePath: string) {
  const relativePath = relative(dirname(fromCssPath), sourcePath).replaceAll('\\', '/')
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

export function injectTailwindSourcesIntoStylesheet(
  code: string,
  id: string,
  sourcePaths: string[],
) {
  const cleanId = id.split('?', 1)[0] ?? id
  if (!cleanId.endsWith('.css')) {
    return null
  }

  const tailwindImportMatch = code.match(/@import\s+["']tailwindcss["'];?/)
  if (!tailwindImportMatch) {
    return null
  }

  const injections: string[] = []
  if (!code.match(/@custom-variant\s+dark\b/)) {
    injections.push(TAILWIND_DARK_VARIANT)
  }

  const registrations = sourcePaths
    .map((sourcePath) => `@source "${toTailwindSourcePath(cleanId, sourcePath)}";`)
    .filter((registration) => !code.includes(registration))

  injections.push(...registrations)

  if (injections.length === 0) {
    return null
  }

  const magic = new MagicString(code)
  const insertAt = tailwindImportMatch.index! + tailwindImportMatch[0].length
  magic.appendLeft(insertAt, `\n${injections.join('\n')}`)

  return {
    code: magic.toString(),
    map: magic.generateMap({
      hires: 'boundary',
      includeContent: true,
      source: cleanId,
    }),
  }
}

export function createTailwindPlugin(sourcePaths: string[]): Plugin {
  let warnedMissingTailwindImport = false

  return {
    enforce: 'pre',
    name: 'ginko-cms:tailwind-source-injection',
    transform(code, id) {
      const result = injectTailwindSourcesIntoStylesheet(code, id, sourcePaths)
      const cleanId = id.split('?', 1)[0] ?? id

      if (
        result === null &&
        cleanId.endsWith('.css') &&
        !warnedMissingTailwindImport &&
        /tailwind/i.test(code) &&
        !code.match(/@import\s+["']tailwindcss["'];?/)
      ) {
        warnedMissingTailwindImport = true
        console.warn(
          `[ginko-cms] Could not inject Tailwind sources into ${cleanId}. ` +
            'Expected @import "tailwindcss"; in the stylesheet.',
        )
      }

      return result
    },
  }
}
