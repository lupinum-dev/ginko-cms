import { defineMcpResource } from '@nuxtjs/mcp-toolkit/server'

export default defineMcpResource({
  name: 'ginko-agent-authoring-guide',
  title: 'Ginko Agent Authoring Guide',
  description: 'Canonical content workflow for agents.',
  uri: 'app://ginko-cms/agent-authoring-guide',
  handler: async (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'text/markdown',
        text: [
          '# Ginko Agent Authoring',
          '',
          'Use the canonical CMS draft and review commands directly. MCP is not a separate workflow engine and does not expose public-output or destructive writes.',
          '',
          'Create content with `create-entry`, then write draft changes with `save-entry-draft`. Preserve current draft data when sending partial updates.',
          '',
          'Use `get-collection` and `get-entry` with `compact: true` for routine planning. Only request full payloads when complete Studio state or schema debugging is needed.',
          '',
          'MCP does not fetch, upload, or browse remote media. Use `get-asset` and `resolve-asset-urls` when you already have asset ids, then place asset ids into rich text or image/file fields with `save-entry-draft`.',
          '',
          'Use public `page`, `list`, `nav`, `search`, and `sitemap` with `compact: true` for editorial verification unless full public payloads are needed.',
          '',
          'Publishing: call `get-readiness-detail`, then `preview-publish` and `request-publish-review` with the active `agentRunId`, observed draft version, entry, and locales. Review requests do not change public output. Use `get-review-status` to follow the human decision.',
          '',
          'Verification loop after a human publisher publishes: call `page`, `list`, `search`, `nav`, and `sitemap` for the same collection and locales.',
          '',
          'Cleanup loop: MCP agents should report cleanup candidates for owner review. Permanent delete requires a verified asset-recovery artifact through owner-controlled Studio or backend operation execution.',
        ].join('\n'),
      },
    ],
  }),
})
