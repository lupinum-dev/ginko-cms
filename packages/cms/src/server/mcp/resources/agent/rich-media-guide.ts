import { defineMcpResource } from '@nuxtjs/mcp-toolkit/server'

export default defineMcpResource({
  name: 'ginko-rich-media-guide',
  title: 'Ginko Rich Text and Media Guide',
  description: 'How agents upload, register, place, and reference media.',
  uri: 'app://ginko-cms/rich-media-guide',
  handler: async (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'text/markdown',
        text: [
          '# Ginko Rich Media',
          '',
          'MCP cannot upload or fetch new media. Add new files through Studio/browser upload, then use MCP to inspect and reuse registered assets.',
          '',
          'Asset ownership is explicit. Article-specific media should be entry-owned. Reusable media for one collection should be collection-owned. Site-wide media should be global. When `entryId` is present, uploads default to entry ownership; otherwise they default to collection ownership when `collection` is present, then global ownership.',
          '',
          'Default sequence: inspect `get-entry`, inspect known media with `get-asset`, place asset ids with `save-entry-draft`, then inspect readiness with `get-readiness-detail`; call `preview-publish` with an active `agentRunId` before requesting human publish review.',
          '',
          'Use `get-asset` and `resolve-asset-urls` when existing asset ids are known. Asset ownership changes remain an owner-controlled Studio workflow.',
          '',
          'When reusing an existing asset in an image/file field, use the asset id directly for image/file fields and `{ src: assetId }` for object image fields that store image metadata.',
          '',
          'For rich text, insert Markdown image references into `bodyMdc` with `save-entry-draft`; the canonical draft save path rebuilds content asset references.',
          '',
          'For image/file fields, write the returned field helper values with `save-entry-draft`. Direct image/file fields store the asset id; object image fields with a `src` child receive `{ src: assetId }`; image-list fields store asset id arrays.',
          '',
          'Asset tools never edit entry drafts. Draft placement stays in `save-entry-draft`.',
        ].join('\n'),
      },
    ],
  }),
})
