import {
  readPortableDirectory,
  verifyPortableDirectoryBounded,
  type PortableDirectoryBundle,
  type PortableDirectoryVerification,
} from '@lupinum/ginko-content/portability/node'

export async function readCmsPortableDirectory(root: string): Promise<PortableDirectoryBundle> {
  return await readPortableDirectory(root)
}

export async function verifyCmsPortableDirectory(
  root: string,
): Promise<PortableDirectoryVerification> {
  return await verifyPortableDirectoryBounded(root)
}
