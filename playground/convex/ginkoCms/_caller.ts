// @trellis-bridge-package: @lupinum/ginko-cms
// @trellis-bridge-version: 0.1.2
import { createCmsComponentBridge, componentArgs } from '@lupinum/ginko-cms-convex/component-bridge'

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query
} from '../_generated/server'

export const component = createCmsComponentBridge({
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction
})

export { componentArgs }
