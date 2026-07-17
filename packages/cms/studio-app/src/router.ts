import { createRouter, createWebHistory } from 'vue-router'

import { readHostBridge } from './boundary/host-bridge'

function normalizeStudioBase(route: unknown): string {
  if (typeof route !== 'string' || route.length === 0) {
    return import.meta.env.DEV ? '/' : '/studio/'
  }

  const withLeadingSlash = route.startsWith('/') ? route : `/${route}`
  return `${withLeadingSlash.replace(/\/+$/, '')}/`
}

function readStudioBase(): string {
  return normalizeStudioBase(readHostBridge().config.route)
}

export function createStudioRouter() {
  return createRouter({
    history: createWebHistory(readStudioBase()),
    routes: [
      {
        path: '/',
        name: 'studio-home',
        component: () => import('./pages/index.vue'),
      },
      {
        path: '/model',
        name: 'studio-collections',
        component: () => import('./pages/collections.vue'),
      },
      {
        path: '/collections',
        redirect: '/model',
      },
      {
        path: '/assets',
        name: 'studio-assets',
        component: () => import('./pages/assets.vue'),
        // RFC Phase 4 step 2: a details surface (asset metadata) lives here, so
        // the right-sidebar toggle is available even before a panel registers.
        meta: { rightSidebar: true },
      },
      {
        path: '/activity',
        name: 'studio-activity',
        component: () => import('./pages/activity.vue'),
      },
      {
        path: '/agents',
        name: 'studio-agents',
        component: () => import('./pages/agents.vue'),
      },
      {
        path: '/reviews',
        name: 'studio-reviews',
        component: () => import('./pages/reviews.vue'),
        // RFC Phase 4 step 2: review / website-change detail surface.
        meta: { rightSidebar: true },
      },
      {
        path: '/settings',
        name: 'studio-settings',
        component: () => import('./pages/settings.vue'),
      },
      {
        path: '/site-data',
        name: 'studio-site-data',
        component: () => import('./pages/site-data.vue'),
      },
      {
        path: '/content/:collection',
        name: 'studio-collection',
        component: () => import('./pages/[collection]/index.vue'),
        // Phase L: collection details (status, work queue, filters) panel.
        meta: { rightSidebar: true },
      },
      {
        path: '/content/:collection/new',
        name: 'studio-new',
        component: () => import('./pages/[collection]/new.vue'),
        // Phase L: draft-setup guidance + route preview panel.
        meta: { rightSidebar: true },
      },
      {
        path: '/content/:collection/:id',
        name: 'studio-edit',
        component: () => import('./pages/[collection]/[id].vue'),
        // RFC Phase 4 step 2 / D4: the entry editor's details panel (status,
        // workflow, history) is the primary right-sidebar surface (defaultOpen).
        meta: { rightSidebar: true },
      },
      {
        // Unknown Studio URLs (stale bookmarks, mistyped paths) render a
        // visible not-found state with an exit instead of a blank canvas.
        path: '/:pathMatch(.*)*',
        name: 'studio-not-found',
        component: () => import('./pages/not-found.vue'),
      },
    ],
  })
}
