import { PORTABLE_IMPORT_LIMITS } from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import {
  readPortableDirectoryForPlanning,
  verifyPortableDirectoryBounded,
  type PortableDirectoryPlanningBundle,
  type PortableDirectoryVerification,
} from '@lupinum/ginko-content/portability/node'

export async function readCmsPortableDirectory(
  root: string,
): Promise<PortableDirectoryPlanningBundle> {
  return await readPortableDirectoryForPlanning(root, {
    documents: PORTABLE_IMPORT_LIMITS.entries,
    assets: PORTABLE_IMPORT_LIMITS.assets,
    documentBytes: PORTABLE_IMPORT_LIMITS.documentBytes,
    totalDocumentBytes: PORTABLE_IMPORT_LIMITS.totalDocumentBytes,
  })
}

export async function verifyCmsPortableDirectory(
  root: string,
): Promise<PortableDirectoryVerification> {
  return await verifyPortableDirectoryBounded(root)
}
