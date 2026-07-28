import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    include:
      process.env.GINKO_CMS_PACKAGE_CONSUMER_TEST === '1'
        ? ['test/module/e2e-package-consumer.test.ts']
        : ['test/**/*.test.ts', 'packages/convex/test/**/*.test.ts'],
    exclude:
      process.env.GINKO_CMS_PACKAGE_CONSUMER_TEST === '1'
        ? []
        : ['test/module/e2e-package-consumer.test.ts'],
    fileParallelism: false,
    name: 'ginko-cms',
  },
  resolve: {
    // Boundary tests mock these package owners. Resolve their root and
    // package-local peer-context instances to one test identity so the mock
    // cannot miss imports made from packages/cms.
    dedupe: ['@nuxt/kit', 'better-convex-nuxt'],
    alias: {
      '#imports': resolve(__dirname, 'test/helpers/nuxt-imports-shim.ts'),
      '#convex/api': resolve(__dirname, 'test/helpers/convex-api-shim.ts'),
      '#component': resolve(__dirname, 'packages/convex/src'),
      '#runtime': resolve(__dirname, 'packages/cms/src/runtime'),
      '#ginko-cms-public': resolve(__dirname, 'packages/cms/src/public'),
      '#ginko-cms-server': resolve(__dirname, 'packages/cms/src/server'),
      '@public': resolve(__dirname, 'packages/cms/src/public'),
      'nitropack/runtime': resolve(__dirname, 'test/helpers/nitro-runtime-shim.ts'),
      '@lupinum/ginko-cms-contract/convex/schemas': resolve(
        __dirname,
        'packages/contract/src/schemas',
      ),
      '@lupinum/ginko-cms-contract/convex/schemas/': resolve(
        __dirname,
        'packages/contract/src/schemas/',
      ),
      '@lupinum/ginko-cms-contract/convex/caller.js': resolve(
        __dirname,
        'packages/contract/src/convex/caller.ts',
      ),
      '@lupinum/ginko-cms-contract/convex/validators.js': resolve(
        __dirname,
        'packages/contract/src/validators.ts',
      ),
      '@lupinum/ginko-cms-contract/shared': resolve(__dirname, 'packages/contract/src'),
      '@lupinum/ginko-cms-contract/shared/fields': resolve(
        __dirname,
        'packages/contract/src/fields',
      ),
      '@lupinum/ginko-cms-contract': resolve(__dirname, 'packages/contract/src'),
      '@lupinum/ginko-cms-convex/mcp': resolve(__dirname, 'packages/convex/src/mcpHandler.ts'),
      '@lupinum/ginko-cms-convex': resolve(__dirname, 'packages/convex/src'),
      '@lupinum/ginko-cms': resolve(__dirname, 'packages/cms/src/module.ts'),
      vue: resolve(__dirname, 'node_modules/vue'),
      // vue-router is a dependency of packages/cms (used by the Studio SPA) and
      // is not hoisted to the workspace root, so tests under test/ that import
      // it directly (or transitively via a Studio composable) resolve it here.
      'vue-router': resolve(__dirname, 'packages/cms/node_modules/vue-router'),
    },
  },
})
