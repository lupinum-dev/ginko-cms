export type ConvexSetupIssue = {
  name: string
  message: string
  fix: string
}

export type ConvexBridgeWriteResult = {
  written: string[]
  managed: string[]
}

export type ConvexBridgeAssertOptions = {
  repair?: boolean
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

export async function assertConvexBridgeInstalled(
  _rootDir: string,
  _options: ConvexBridgeAssertOptions = {},
): Promise<void> {
  // TODO(trellis-cutover): Phase 7 restores direct-template install checks.
  // Phase 2 must not let the disabled bridge installer block Nuxt prepare.
}

export async function writeConvexBridgeFiles(_rootDir: string): Promise<ConvexBridgeWriteResult> {
  throw new Error('TODO(trellis-cutover): restore direct-template component install in Phase 7')
}
