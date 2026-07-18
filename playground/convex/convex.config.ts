import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import betterAuth from 'better-convex-nuxt/convex-auth/convex.config'
import { defineApp } from 'convex/server'

const app = defineApp()

app.use(betterAuth, { name: 'betterAuth' })
app.use(ginkoCms)

export default app
