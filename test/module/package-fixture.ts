import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type PackageJsonDependencies = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
  peerDependencies?: Record<string, string>
}

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
export const cmsPackageRoot = resolve(projectRoot, 'packages/cms')
export const contractPackageRoot = resolve(projectRoot, 'packages/contract')
export const convexPackageRoot = resolve(projectRoot, 'packages/convex')
export const contentPackageRoot = resolve(projectRoot, '..', 'ginko-content/packages/content')

export function readPackageJson(packageRoot: string): PackageJsonDependencies {
  return JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
}

export function packPackage(packageRoot: string, destination: string) {
  const packOutput = execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', destination], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const tarballName = packOutput
    .trim()
    .split(/\r?\n/)
    .findLast((line) => line.endsWith('.tgz'))
  if (!tarballName) {
    throw new Error(`Could not determine packed tarball from: ${packOutput}`)
  }
  return resolve(destination, tarballName)
}
