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
      },
      {
        path: '/content/:collection/new',
        name: 'studio-new',
        component: () => import('./pages/[collection]/new.vue'),
      },
      {
        path: '/content/:collection/:id',
        name: 'studio-edit',
        component: () => import('./pages/[collection]/[id].vue'),
      },
    ],
  })
}
