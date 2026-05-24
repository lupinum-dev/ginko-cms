import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  // nuxt-module-build validates package exports before `build:extras` emits
  // the facade files that are intentionally outside src/runtime. Package E2E
  // verifies these publish-facing files after the full build.
  failOnWarn: false,
})
