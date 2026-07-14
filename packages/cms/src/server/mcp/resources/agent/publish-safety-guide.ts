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
          'MCP agents use review-gated CMS operations. Use `get-readiness-detail` and `preview-publish` with the active `agentRunId` to inspect blockers and public-impact changes. Use `request-publish-review` to create a human review request without changing public output, then use `get-review-status` to follow the decision.',
          '',
          'Rerun the preview if arguments, draft state, or target state changed before publishing or requesting review.',
          '',
          'Review requests bind operation id, caller, target entry, args, preview state, and draft version. Changed draft state or blocked publish diagnostics require a new request.',
          '',
          'Ginko stores publish review requests in Convex. A publisher or owner approves them through the CMS operation layer. MCP cannot publish directly.',
          '',
          'Production MCP calls use Better Auth API-key sessions for Convex transport. MCP tools use explicit CMS Convex component refs for diagnostics, review requests, and guarded publish operations.',
        ].join('\n'),
      },
    ],
  }),
})
