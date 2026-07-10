import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const tsconfigRaw = readFileSync('tsconfig.json', 'utf-8')

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
    alias: {
      '#imports': resolve(__dirname, 'test/helpers/nuxt-imports-shim.ts'),
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
      vue: resolve(__dirname, 'node_modules/vue'),
    },
  },
  esbuild: {
    tsconfigRaw,
  },
})
