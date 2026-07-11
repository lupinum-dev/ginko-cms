import {
  checkCollectionContractsReturns,
  checkCollectionContractsHandler,
  installCollectionContractsArgs,
  installCollectionContractsHandler,
  installCollectionContractsReturns,
} from './collections/sync.js'
import { mutation, query } from './functions.js'

export { listCollections, getCollection } from './collections/contracts.js'

export { recomputeCollectionDerivedState } from './collections/sync.js'

export const checkCollectionContracts = query({
  args: installCollectionContractsArgs,
  returns: checkCollectionContractsReturns,
  handler: async (ctx, args) => await checkCollectionContractsHandler(ctx, args),
})

export const installCollectionContracts = mutation({
  args: installCollectionContractsArgs,
  returns: installCollectionContractsReturns,
  handler: async (ctx, args) => await installCollectionContractsHandler(ctx, args),
})
