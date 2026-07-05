import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import { defineApp } from 'convex/server'

import betterAuth from './betterAuth/convex.config'

const app = defineApp()

app.use(betterAuth, { name: 'betterAuth' })
app.use(ginkoCms)

export default app
