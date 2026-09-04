import { bindContentProvider, type ContentProvider } from '@lupinum/ginko-content/provider'

import { contentDataSource } from './nuxt-provider/data-source.js'
import { callerForEvent, setClientFactoryForTests } from './nuxt-provider/transport.js'

export const __setGinkoNuxtProviderClientFactoryForTests = (
  factory: Parameters<typeof setClientFactoryForTests>[0],
) => {
  setClientFactoryForTests(factory)
}

const contentProvider: ContentProvider = bindContentProvider({
  source: contentDataSource,
  createContext: async (event) => ({ event, caller: await callerForEvent(event) }),
})

export { contentProvider }
export default contentProvider
