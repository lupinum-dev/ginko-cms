import { writeConvexSetupFiles } from '../../packages/cms/src/module/convex.js'

export async function installBridge(rootDir: string) {
  writeConvexSetupFiles(rootDir)
}
