import { resolve } from 'node:path'

import { extendPages } from '@nuxt/kit'

// Auth pages ship as plain Nuxt pages so anonymous users can sign in without
// loading the editor stack. Everything else under `${studioRoute}/*` is a
// single catchall host page that mounts the standalone Studio SPA.
export function registerStudioPages(studioRoute: string, authDir: string, runtimeDir: string) {
  extendPages((pages) => {
    pages.push(
      {
        name: 'studio-auth-signin',
        path: `${studioRoute}/auth/signin`,
        file: resolve(authDir, 'pages/signin.vue'),
        meta: {
          layout: false,
        },
      },
      {
        name: 'studio-auth-register',
        path: `${studioRoute}/auth/register`,
        file: resolve(authDir, 'pages/register.vue'),
        meta: {
          layout: false,
        },
      },
      {
        name: 'studio-host',
        // The unnamed catchall (`:slug(.*)*`) matches both /studio and
        // /studio/anything/deep — including /studio itself thanks to the
        // optional segment.
        path: `${studioRoute}/:slug(.*)*`,
        file: resolve(runtimeDir, 'pages/studio-host.vue'),
        meta: {
          layout: false,
        },
      },
    )
  })
}
