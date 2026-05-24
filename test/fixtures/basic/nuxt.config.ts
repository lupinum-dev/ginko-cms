import MyModule from '../../../packages/cms/src/module'

export default defineNuxtConfig({
  modules: [MyModule],
  i18n: {
    strategy: 'prefix_except_default',
    autoDetectLanguage: false,
    localeCookie: null,
  },
})
