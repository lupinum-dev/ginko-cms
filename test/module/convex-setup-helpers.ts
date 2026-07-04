import { writeConvexSetupFiles } from '../../packages/cms/src/module/convex.js'

export async function installConvexSetup(rootDir: string) {
  writeConvexSetupFiles(rootDir)
}
