import {
  readPortableDirectoryMetadata,
  verifyPortableDirectoryBounded,
  type PortableDirectoryMetadata,
  type PortableDirectoryVerification,
} from '@lupinum/ginko-content/portability/node'

export async function readCmsPortableDirectory(root: string): Promise<PortableDirectoryMetadata> {
  return await readPortableDirectoryMetadata(root)
}

export async function verifyCmsPortableDirectory(
  root: string,
): Promise<PortableDirectoryVerification> {
  return await verifyPortableDirectoryBounded(root)
}
