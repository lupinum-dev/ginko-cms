import {
  CMS_PROVIDER_WIRE_PROTOCOL,
  createCmsProviderWireEnvelope,
} from '@lupinum/ginko-content/cms-contract'
import { v, type GenericValidator } from 'convex/values'

export const cmsProviderWireValidator = <ResultValidator extends GenericValidator>(
  result: ResultValidator,
) =>
  v.object({
    protocol: v.literal(CMS_PROVIDER_WIRE_PROTOCOL),
    result,
  })

export const cmsProviderWireResult = createCmsProviderWireEnvelope
