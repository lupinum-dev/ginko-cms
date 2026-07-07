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
          'MCP agents use the same guarded CMS operations as Studio. Use `get-readiness-detail` to inspect readiness. Use `preview-publish` with the active `agentRunId` to inspect blockers, confirmation data, and public-impact changes only when the credential has publish permission. If the credential has publish permission and the user asked for direct publish, use `publish-entry`; otherwise use `request-publish-review` to create a human review request without changing public output.',
          '',
          'Rerun the preview if arguments, draft state, or target state changed before publishing or requesting review.',
          '',
          'Review requests bind operation id, caller, target entry, args, preview state, and draft version. Changed draft state or blocked publish diagnostics require a new request.',
          '',
          'Ginko stores publish review requests in Convex. A publisher or owner approves them through the CMS operation layer; direct MCP publish also executes through that same publish operation and confirmation flow.',
          '',
          'Production MCP calls use Better Auth API-key sessions for Convex transport. MCP tools use explicit CMS Convex component refs for diagnostics, review requests, and guarded publish operations.',
        ].join('\n'),
      },
    ],
  }),
})
