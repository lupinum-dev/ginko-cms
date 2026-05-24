import { defineMcpHandler } from '#trellis/mcp'

import { mcpTools } from './_shared/handler-tools'

export default defineMcpHandler({
  name: 'ginko-cms',
  route: '/mcp',
  browserRedirect: '/',
  tools: mcpTools,
})
