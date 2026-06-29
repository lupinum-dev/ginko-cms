export class GinkoCmsHostSetupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GinkoCmsHostSetupValidationError'
  }
}

export const ginkoCmsBridgeManifest = {
  packageName: '@lupinum/ginko-cms',
  modules: [],
}

export function renderConvexConfig(current: string | null): string {
  if (current) return current
  return [
    "import betterAuth from '@convex-dev/better-auth/convex.config'",
    "import { defineApp } from 'convex/server'",
    "import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'",
    '',
    'const app = defineApp()',
    "app.use(betterAuth, { name: 'betterAuth' })",
    'app.use(ginkoCms)',
    '',
    'export default app',
    '',
  ].join('\n')
}

export function renderAuthConfig(current: string | null): string {
  return current ?? ''
}

export function renderSchema(current: string | null): string {
  return current ?? ''
}

export default ginkoCmsBridgeManifest

