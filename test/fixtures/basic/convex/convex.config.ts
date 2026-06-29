import betterAuth from '@convex-dev/better-auth/convex.config'
import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import { defineApp } from 'convex/server'
const app = defineApp()

app.use(betterAuth, { name: 'betterAuth' })

// @ginko-cms-managed-start: @lupinum/ginko-cms convex-component
app.use(ginkoCms)
// @ginko-cms-managed-end: @lupinum/ginko-cms convex-component

export default app
