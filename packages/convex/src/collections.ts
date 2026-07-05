import {
  checkCollectionContractsReturns,
  checkCollectionContractsHandler,
  installCollectionContractsArgs,
  installCollectionContractsHandler,
  installCollectionContractsReturns,
} from './collections/sync.js'
import { directInternalMutation, directInternalQuery } from './functions.js'

export { listCollections, getCollection } from './collections/contracts.js'

export { recomputeCollectionDerivedState } from './collections/sync.js'

export const checkCollectionContracts = directInternalQuery({
  id: 'collections:checkCollectionContracts',
  args: installCollectionContractsArgs,
  returns: checkCollectionContractsReturns,
  handler: async (ctx, args) => await checkCollectionContractsHandler(ctx, args),
})

export const installCollectionContracts = directInternalMutation({
  id: 'collections:installCollectionContracts',
  args: installCollectionContractsArgs,
  returns: installCollectionContractsReturns,
  handler: async (ctx, args) => await installCollectionContractsHandler(ctx, args),
})
