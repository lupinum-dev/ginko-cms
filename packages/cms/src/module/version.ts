import { readFileSync } from 'node:fs'

export function readModuleVersion(resolveFromModule: (path: string) => string): string {
  try {
    const pkgPath = resolveFromModule('../package.json')
    const version = JSON.parse(readFileSync(pkgPath, 'utf-8')).version
    if (typeof version === 'string' && version.length > 0) {
      return version
    }
  } catch (error) {
    throw new Error(
      `[ginko-cms] Failed to resolve package version for managed Convex files: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }

  throw new Error('[ginko-cms] package.json is missing a valid version for managed Convex files')
}
