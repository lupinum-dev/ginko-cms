import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { convexTestConfig } from '@lupinum/trellis/testing'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Build the base config from convexTestConfig, then override
// esbuild.tsconfigRaw with a string so Vite 7 skips file-based
// tsconfig resolution (which fails without .nuxt/tsconfig.json).
const baseConfig = convexTestConfig({
  test: {
    include:
      process.env.GINKO_CMS_PACKAGE_CONSUMER_TEST === '1'
        ? ['test/module/e2e-package-consumer.test.ts']
        : ['test/**/*.test.ts'],
    exclude:
      process.env.GINKO_CMS_PACKAGE_CONSUMER_TEST === '1'
        ? []
        : ['test/module/e2e-package-consumer.test.ts'],
    fileParallelism: false,
    name: 'ginko-cms',
  },
})

const tsconfigRaw = readFileSync('tsconfig.json', 'utf-8')
const esbuildConfig = typeof baseConfig.esbuild === 'object' ? baseConfig.esbuild : {}

export default defineConfig({
  ...baseConfig,
  plugins: [vue()],
  resolve: {
    alias: {
      '#trellis/api': resolve(__dirname, 'test/stubs/trellis-api.ts'),
      '#trellis': resolve(__dirname, '.nuxt/trellis'),
      '#component': resolve(__dirname, 'packages/convex/src'),
      '#runtime': resolve(__dirname, 'packages/cms/src/runtime'),
      '#ginko-cms-public': resolve(__dirname, 'packages/cms/src/public'),
      '#ginko-cms-server': resolve(__dirname, 'packages/cms/src/server'),
      '@public': resolve(__dirname, 'packages/cms/src/public'),
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
      '@lupinum/ginko-cms-convex': resolve(__dirname, 'packages/convex/src'),
      '@lupinum/ginko-cms': resolve(__dirname, 'packages/cms/src/module.ts'),
      '@lupinum/ginko-content/cms-contract': resolve(
        __dirname,
        '../ginko-content/packages/content/src/cms-contract/index.ts',
      ),
      '@lupinum/ginko-content/cms-import': resolve(
        __dirname,
        '../ginko-content/packages/content/src/cms-import/index.ts',
      ),
      vue: resolve(__dirname, 'node_modules/vue'),
    },
  },
  esbuild: {
    ...esbuildConfig,
    tsconfigRaw,
  },
})
