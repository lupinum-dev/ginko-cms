import { writeConvexSetupFiles } from '../../packages/cms/src/module/convex.js'

export async function installConvexSetup(rootDir: string, options: { mcp?: boolean } = {}) {
  writeConvexSetupFiles(rootDir, { mcp: options.mcp ?? false })
}
