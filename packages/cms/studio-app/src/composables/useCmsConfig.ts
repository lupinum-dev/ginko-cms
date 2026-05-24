// Re-export so studio code's existing
// `from '#ginko-cms-public/composables/useCmsConfig'` lines become
// `from '../composables/useCmsConfig'` in the SPA via the codemod, with
// no API change.
export { useCmsConfig } from '../boundary/host-bridge'
