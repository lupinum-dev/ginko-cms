import {
  readPortableDirectory,
  verifyPortableDirectory,
  type PortableDirectoryBundle,
} from '@lupinum/ginko-content/portability/node'

export async function readCmsPortableDirectory(root: string): Promise<PortableDirectoryBundle> {
  return await readPortableDirectory(root)
}

export async function verifyCmsPortableDirectory(root: string): Promise<PortableDirectoryBundle> {
  return await verifyPortableDirectory(root)
}
