export type CmsMcpOperationRequest = {
  operationId: string
  args: unknown
}

export function createDisabledCmsMcpOperationRuntime() {
  return {
    async preview(_request: CmsMcpOperationRequest) {
      throw new Error('TODO(trellis-cutover): restore CMS operation preview in Phase 8')
    },
    async execute(_request: CmsMcpOperationRequest) {
      throw new Error('TODO(trellis-cutover): restore CMS operation execute in Phase 8')
    },
  }
}

