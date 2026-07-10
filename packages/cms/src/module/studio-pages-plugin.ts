type StudioPagesPluginOptions = {
  studioRoute: string
  signInPage: string
  registerPage: string
  hostPage: string
}

export function renderStudioPagesPlugin(options: StudioPagesPluginOptions): string {
  const studioRoute = options.studioRoute.replace(/\/$/, '') || '/studio'
  const route = JSON.stringify(studioRoute)
  const signInPage = JSON.stringify(options.signInPage)
  const registerPage = JSON.stringify(options.registerPage)
  const hostPage = JSON.stringify(options.hostPage)

  return `import { defineNuxtPlugin } from '#app'

const routeNames = ['studio-auth-signin', 'studio-auth-register', 'studio-host']

export default defineNuxtPlugin((nuxtApp) => {
  for (const name of routeNames) {
    if (nuxtApp.$router.hasRoute(name)) {
      throw new Error(
        \`@lupinum/ginko-cms cannot register route "\${name}" because the host already uses that route name.\`,
      )
    }
  }

  nuxtApp.$router.addRoute({
    name: 'studio-auth-signin',
    path: ${route} + '/auth/signin',
    component: () => import(${signInPage}),
    meta: { layout: false },
  })
  nuxtApp.$router.addRoute({
    name: 'studio-auth-register',
    path: ${route} + '/auth/register',
    component: () => import(${registerPage}),
    meta: { layout: false },
  })
  nuxtApp.$router.addRoute({
    name: 'studio-host',
    path: ${route} + '/:slug(.*)*',
    component: () => import(${hostPage}),
    meta: { layout: false },
  })
})
`
}
