import { cmsPermissionKeys, type CmsPermissionKey } from '../composables/permissions'

export type StudioStaticRouteId =
  | 'home'
  | 'siteData'
  | 'assets'
  | 'reviews'
  | 'collections'
  | 'activity'
  | 'agents'
  | 'settings'

export type StudioRouteSection = 'home' | 'editor' | 'operations' | 'settings'

export type StudioStaticRoute = {
  id: StudioStaticRouteId
  path: string
  icon: string
  section: StudioRouteSection
  labelKey: string
  subtitleKey?: string
  requiredCapability?: CmsPermissionKey
}

export const studioStaticRoutes: StudioStaticRoute[] = [
  {
    id: 'home',
    path: '',
    icon: 'lucide:layout-dashboard',
    section: 'home',
    labelKey: 'ginkoCms.studio.commandPalette.dashboardTitle',
    subtitleKey: 'ginkoCms.studio.commandPalette.dashboardSubtitle',
  },
  {
    id: 'siteData',
    path: 'site-data',
    icon: 'lucide:database',
    section: 'editor',
    labelKey: 'ginkoCms.studio.siteDataPage.title',
    subtitleKey: 'ginkoCms.studio.commandPalette.siteDataSubtitle',
    requiredCapability: cmsPermissionKeys.manageSettings,
  },
  {
    id: 'assets',
    path: 'assets',
    icon: 'lucide:image',
    section: 'editor',
    labelKey: 'ginkoCms.studio.assetsPage.title',
    subtitleKey: 'ginkoCms.studio.commandPalette.assetsSubtitle',
    requiredCapability: cmsPermissionKeys.manageAssets,
  },
  {
    id: 'reviews',
    path: 'reviews',
    icon: 'lucide:inbox',
    section: 'editor',
    labelKey: 'ginkoCms.studio.reviewsPage.title',
    subtitleKey: 'ginkoCms.studio.reviewsPage.description',
    requiredCapability: cmsPermissionKeys.publishEntries,
  },
  {
    id: 'collections',
    path: 'model',
    icon: 'lucide:layers',
    section: 'operations',
    labelKey: 'ginkoCms.studio.collectionsPage.title',
    subtitleKey: 'ginkoCms.studio.commandPalette.collectionsSubtitle',
    requiredCapability: cmsPermissionKeys.manageCollections,
  },
  {
    id: 'activity',
    path: 'activity',
    icon: 'lucide:activity',
    section: 'operations',
    labelKey: 'ginkoCms.studio.activityPage.title',
    subtitleKey: 'ginkoCms.studio.activityPage.description',
    requiredCapability: cmsPermissionKeys.manageSettings,
  },
  {
    id: 'agents',
    path: 'agents',
    icon: 'lucide:bot',
    section: 'operations',
    labelKey: 'ginkoCms.studio.agentsPage.title',
    subtitleKey: 'ginkoCms.studio.agentsPage.description',
    requiredCapability: cmsPermissionKeys.manageSettings,
  },
  {
    id: 'settings',
    path: 'settings',
    icon: 'lucide:settings',
    section: 'settings',
    labelKey: 'ginkoCms.studio.settingsPage.title',
    subtitleKey: 'ginkoCms.studio.commandPalette.settingsSubtitle',
    requiredCapability: cmsPermissionKeys.manageSettings,
  },
]

export const studioRouteSectionOrder: StudioRouteSection[] = [
  'home',
  'editor',
  'operations',
  'settings',
]

export function studioRouteHref(studioRoute: string, route: StudioStaticRoute): string {
  const base = studioRoute.replace(/\/$/, '')
  // Inside the SPA `studioRoute` is '' (the router base owns the prefix), so
  // the Home entry must resolve to '/' — an empty `to` would be a self-link.
  return route.path ? `${base}/${route.path}` : base || '/'
}

export function studioRoutesForSection(section: StudioRouteSection): StudioStaticRoute[] {
  return studioStaticRoutes.filter((route) => route.section === section)
}
