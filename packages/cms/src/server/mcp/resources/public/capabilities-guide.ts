import { defineMcpResource } from '@nuxtjs/mcp-toolkit/server'

export default defineMcpResource({
  name: 'ginko-capabilities-guide',
  title: 'Ginko Collection Capabilities Guide',
  description: 'How agents should interpret route-backed and data-only collection capabilities.',
  uri: 'app://ginko-cms/capabilities-guide',
  handler: async (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'text/markdown',
        text: [
          '# Ginko Collection Capabilities',
          '',
          'Collection contracts are code-defined by the host project. Agents may inspect collection fields, route mode, locales, and public capability, but they must not create, update, delete, import, or reorder collection contracts through MCP.',
          '',
          'Route-backed collections can participate in public page reads, nav, surround, search, and sitemap output when an entry locale is published and has a public route.',
          '',
          'Public reads may accept canonical internal paths for lookup, but returned `href` values are always the locale-aware public URLs. Collection-scoped public tools reject unsupported locales with `UNSUPPORTED_LOCALE` instead of returning silent empty results.',
          '',
          'Data-only collections are not public routes. Public list reads can inspect their published rows, but agents must not call page, nav, surround, search, or sitemap tools for them.',
          '',
          'Studio shows the same workflow an agent should follow: inspect collection capability, inspect entry locale state, run `explain-public-visibility`, call `publish-entry` without `_confirmationToken` for an operation preview as needed, then ask for confirmation before any publish execution.',
          '',
          'Before publishing a localized route, inspect collection mode, localized required fields, parent route state, route collisions, and public visibility diagnostics.',
          '',
          'For translation prep, compare source and target locale data, check whether the target locale draft exists, inspect missing required fields and route blockers, and use `publish-entry` without `_confirmationToken` only as readiness context. Previewing never publishes content; allowed previews create short-lived confirmation state.',
          '',
          'Filesystem import execution is intentionally not part of the curated MCP surface. Imports operate under code-defined collections and should be handled through the owner-controlled Studio or CLI flow, then inspected through normal collection, entry, and public diagnostics tools.',
        ].join('\n'),
      },
    ],
  }),
})
