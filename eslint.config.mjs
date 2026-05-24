import trellis from '@lupinum/trellis-eslint'
// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Formatting is owned by oxfmt for app-authored package source.
    // Templates, fixtures, generated files, and build output stay out
    // of this surface so exact generated/template byte shape is preserved.
    stylistic: false,
  },
  dirs: {
    src: ['./packages'],
  },
})
  .append(trellis.configs.recommended)
  .append({
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/playground/**',
      '**/templates/**',
      '**/test/fixtures/**',
      '**/.nuxt/**',
      '**/_generated/**',
      '**/*.d.ts',
      'packages/contract/src/**/*.js',
    ],
  })
  .append({
    files: [
      'packages/cms/src/auth/pages/**/*.vue',
      'packages/cms/studio-app/src/Layout.vue',
      'packages/cms/studio-app/src/pages/**/*.vue',
      'packages/cms/studio-app/src/components/Icon.vue',
      'packages/cms/studio-app/src/components/ui/**/*.vue',
    ],
    rules: {
      // Route files, the SPA shell, and vendored UI primitives intentionally
      // use framework/primitive names. Product components stay multi-word.
      'vue/multi-word-component-names': 'off',
    },
  })
  .append({
    files: ['packages/**/*.vue'],
    rules: {
      'vue/html-self-closing': [
        'warn',
        {
          html: {
            void: 'any',
            normal: 'always',
            component: 'always',
          },
          svg: 'always',
          math: 'always',
        },
      ],
      'vue/require-default-prop': 'off',
    },
  })
  .append({
    files: [
      'packages/convex/src/**/*.ts',
      'packages/cms/src/runtime/**/*.ts',
      'packages/cms/src/runtime/**/*.vue',
      'test/**/*.ts',
    ],
    rules: {
      // Convex handler parameters (ctx, args, q) and runtime composable deps
      // use `any` for Convex query/mutation return types that lack proper
      // generic inference. Tracked for proper typing.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  })
