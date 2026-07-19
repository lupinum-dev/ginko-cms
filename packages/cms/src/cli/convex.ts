import { spawn } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const cliDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(cliDir, '../..')

export function resolveConvexCliBin(): string {
  const packageJsonPath = require.resolve('convex/package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    bin?: string | Record<string, string>
  }
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.convex
  if (!bin) throw new Error('The bundled Convex CLI does not expose a convex binary.')
  return resolve(dirname(packageJsonPath), bin)
}

function findPackageRoot(resolvedPath: string): string {
  let current = dirname(resolvedPath)
  const root = parse(current).root
  while (current !== root) {
    if (existsSync(resolve(current, 'package.json'))) return current
    current = dirname(current)
  }
  throw new Error(`Could not find package root for ${resolvedPath}.`)
}

function resolveInstalledDependencyRoot(packageName: string, cwd: string): string {
  const hostDependencyPath = resolve(cwd, 'node_modules', packageName)
  if (existsSync(hostDependencyPath)) return realpathSync(hostDependencyPath)

  try {
    return findPackageRoot(require.resolve(`${packageName}/package.json`, { paths: [cwd] }))
  } catch {
    // Continue to the bundled dependency fallback below.
  }

  const bundledDependencyPath = resolve(packageRoot, 'node_modules', packageName)
  if (existsSync(bundledDependencyPath)) return realpathSync(bundledDependencyPath)

  throw new Error(`Could not find installed dependency ${packageName}.`)
}

function ensurePackageLink(
  cwd: string,
  packageName: string,
  dependencyRoot: string,
): (() => void) | null {
  const linkPath = resolve(cwd, 'node_modules', packageName)
  if (existsSync(linkPath)) {
    try {
      if (
        lstatSync(linkPath).isSymbolicLink() &&
        realpathSync(linkPath) === realpathSync(dependencyRoot)
      ) {
        return null
      }
    } catch {
      return null
    }
    return null
  }

  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(dependencyRoot, linkPath, 'dir')

  return () => {
    try {
      if (lstatSync(linkPath).isSymbolicLink()) {
        rmSync(linkPath, { force: true })
      }
    } catch {
      // Best-effort cleanup only. A stale node_modules symlink is harmless and
      // will be replaced by the package manager on the next install.
    }
  }
}

function ensureConvexPackageLinks(cwd: string): () => void {
  const cleanups = [
    ensurePackageLink(cwd, 'convex', findPackageRoot(require.resolve('convex/server'))),
    ensurePackageLink(
      cwd,
      'better-convex-nuxt',
      resolveInstalledDependencyRoot('better-convex-nuxt', cwd),
    ),
    ensurePackageLink(
      cwd,
      '@lupinum/ginko-cms-convex',
      resolveInstalledDependencyRoot('@lupinum/ginko-cms-convex', cwd),
    ),
  ].filter((cleanup): cleanup is () => void => typeof cleanup === 'function')

  return () => {
    for (const cleanup of cleanups.reverse()) cleanup()
  }
}

function withNodeRequireOption(existing: string | undefined, requiredPath: string): string {
  const option = `--require=${requiredPath}`
  return existing ? `${existing} ${option}` : option
}

export function runNodeScript(
  scriptPath: string,
  args: string[],
  options: { cwd: string },
): Promise<number> {
  const shimPath = resolve(cliDir, 'convex-package-json-shim.cjs')
  const cleanupConvexLinks = ensureConvexPackageLinks(options.cwd)
  const cleanup = () => cleanupConvexLinks()
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        GINKO_CMS_CONVEX_PROJECT_CWD: options.cwd,
        NODE_OPTIONS: withNodeRequireOption(process.env.NODE_OPTIONS, shimPath),
      },
      stdio: 'inherit',
    })
    child.once('error', (error) => {
      cleanup()
      reject(error)
    })
    child.once('close', (code, signal) => {
      cleanup()
      if (signal) {
        resolvePromise(1)
        return
      }
      resolvePromise(code ?? 1)
    })
  })
}
