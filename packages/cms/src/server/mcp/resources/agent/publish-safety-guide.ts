import { defineMcpResource } from '@nuxtjs/mcp-toolkit/server'

export default defineMcpResource({
  name: 'ginko-publish-safety-guide',
  title: 'Ginko Publish Safety Guide',
  description: 'Confirmation-token rules for publishing and destructive actions.',
  uri: 'app://ginko-cms/publish-safety-guide',
  handler: async (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'text/markdown',
        text: [
          '# Ginko Publish Safety',
          '',
          'Publishing, unpublishing, deleting, archiving, and other destructive actions are CMS operation-backed MCP tools. First call the tool without `_confirmationToken` to receive a preview. Read `allowed`, `blockers`, `warnings`, and `effects`; execute only after explicit user approval by repeating the same arguments with `preview.confirmation.token`. That confirmation token is the execution contract.',
          '',
          'Rerun the preview if arguments, draft state, or target state changed before execution.',
          '',
          'Tokens bind operation id, execute path, preview path, caller, scope, args, preview state, and version. Changed args, changed draft state, stale version, changed caller, blocked preview, and replay are rejected.',
          '',
          'Ginko stores destructive confirmation state in Convex. The token returned by preview is an opaque lookup key; the trusted operation, caller, args, preview hash, and version data live in the backend row.',
          '',
          'Production needs `CONVEX_DEPLOY_KEY` for MCP server-to-Convex calls, and the generated MCP bridge must export the preview and execute functions used by the tools.',
        ].join('\n'),
      },
    ],
  }),
})
