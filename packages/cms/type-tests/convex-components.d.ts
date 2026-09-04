import type { ComponentApi as BetterAuthComponentApi } from '@lupinum/better-convex-nuxt/better-auth/_generated/component.js'
import type { ComponentApi } from '@lupinum/ginko-cms-convex/component'

declare module '../../../playground/convex/_generated/api.js' {
  export const components: {
    readonly betterAuth: BetterAuthComponentApi
    readonly ginkoCms: ComponentApi
  }
}

declare module '../../../playground/convex/_generated/api' {
  export const components: {
    readonly betterAuth: BetterAuthComponentApi
    readonly ginkoCms: ComponentApi
  }
}
