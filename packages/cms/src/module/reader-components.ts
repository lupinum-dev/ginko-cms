import type { Component } from '@nuxt/schema'

import type { CmsEditorialLayout } from './options.js'

/** Reuse the authoring contract's component names; do not add a second registry. */
export function readerComponentTemplate(
  layout: CmsEditorialLayout | undefined,
  components: Component[],
) {
  const names = new Set<string>()
  for (const collection of Object.values(layout?.collections ?? {})) {
    const source = collection.authoring
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    const implementation = source.implementation
    if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation))
      continue
    for (const entry of Object.values(implementation)) {
      if (
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof entry.componentName === 'string'
      )
        names.add(entry.componentName)
    }
  }
  const selected = new Map(
    components
      .filter(
        (component) =>
          names.has(component.pascalName) && !component.island && component.mode !== 'server',
      )
      .map((component) => [component.pascalName, component]),
  )
  return [
    "import { defineAsyncComponent } from 'vue'",
    'export default {',
    ...Array.from(
      selected.values(),
      (component) =>
        `  ${JSON.stringify(component.pascalName)}: defineAsyncComponent(() => import(${JSON.stringify(component.filePath)}).then(module => module[${JSON.stringify(component.export || 'default')}])),`,
    ),
    '}',
  ].join('\n')
}
