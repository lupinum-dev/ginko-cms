import { listCollections } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: listCollections,
  call: components.ginkoCms.collections.listCollections,
  capability: 'readCms',
  meta: {
    name: 'list-collections',
  },
  group: 'collections',
  respond: ({ args, result, ok, error }) => {
    void args
    void error
    const collections = result
    return ok(
      { collections: collections },
      `Found ${collections.length} collection${collections.length === 1 ? '' : 's'}.`,
    )
  },
  operation: 'query',
})

export default tool
