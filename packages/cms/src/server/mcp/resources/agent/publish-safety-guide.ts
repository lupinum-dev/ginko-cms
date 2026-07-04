import { defineMcpResource } from '@nuxtjs/mcp-toolkit/server'

export default defineMcpResource({
  name: 'ginko-publish-safety-guide',
  title: 'Ginko Publish Safety Guide',
  description: 'Safe publishing and destructive-action boundaries for MCP agents.',
  uri: 'app://ginko-cms/publish-safety-guide',
  handler: async (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'text/markdown',
        text: [
          '# Ginko Publish Safety',
          '',
          'MCP agents do not execute publishing, unpublishing, deleting, or archiving directly from the default tool surface. Use `preview-publish` to inspect blockers and public-impact changes, then `request-publish-review` to create a human review request without changing public output.',
          '',
          'Rerun the preview if arguments, draft state, or target state changed before requesting review.',
          '',
          'Review requests bind operation id, caller, target entry, args, preview state, and draft version. Changed draft state or blocked publish diagnostics require a new request.',
          '',
          'Ginko stores publish review requests in Convex. A publisher or owner approves them through the CMS operation layer.',
          '',
          'Production MCP calls use Better Auth API-key sessions for Convex transport. MCP tools use explicit CMS Convex component refs for diagnostics and review requests.',
        ].join('\n'),
      },
    ],
  }),
})
