export type ConvexSetupIssue = {
  name: string
  message: string
  fix: string
}

export type ConvexBridgeWriteResult = {
  written: string[]
  managed: string[]
}

export function checkConvexComponentInstall(_rootDir: string): ConvexSetupIssue[] {
  return [
    {
      name: 'cms component installer disabled',
      message: 'TODO(trellis-cutover): restore direct-template component install checks in Phase 7.',
      fix: 'Use the Phase 7 direct-template installer plan.',
    },
  ]
}

export async function writeConvexBridgeFiles(_rootDir: string): Promise<ConvexBridgeWriteResult> {
  throw new Error('TODO(trellis-cutover): restore direct-template component install in Phase 7')
}

