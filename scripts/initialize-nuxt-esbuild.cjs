// Nuxt's terminal setup on macOS with Node 24 can leave Nitro's lazy esbuild
// spawn with an invalid inherited file descriptor (spawn EBADF). Start Nitro's
// own service before Nuxt installs those terminal handlers. This preload belongs
// only to the local development process; consumer and production bundles never
// import it. --no-fork keeps Nuxt in the process that owns the service.
if (
  process.platform === 'darwin' &&
  process.versions.node.startsWith('24.') &&
  require('node:worker_threads').isMainThread
) {
  const { createRequire } = require('node:module')
  const { resolve } = require('node:path')
  const fromCms = createRequire(resolve(__dirname, '../packages/cms/package.json'))
  const fromNitro = createRequire(fromCms.resolve('nitropack/package.json'))
  fromNitro('esbuild').initialize()
}
