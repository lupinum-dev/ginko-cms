import { defineMcpHandler } from '@nuxtjs/mcp-toolkit/server'

import { mcpTools } from '../../_shared/handler-tools'

export default defineMcpHandler({
  name: 'code',
  route: '/mcp/code',
  browserRedirect: '/',
  experimental_codeMode: true,
  tools: mcpTools,
})
