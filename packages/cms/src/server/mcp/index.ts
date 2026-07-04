import { defineMcpHandler } from '@nuxtjs/mcp-toolkit/server'

import { mcpTools } from './_shared/handler-tools'

export default defineMcpHandler({
  name: 'ginko-cms',
  route: '/mcp',
  browserRedirect: '/',
  tools: mcpTools,
})
