import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
  renderComponentBridgeManagedEdits,
} from '@lupinum/trellis-bridge/manifest'

import { ginkoCmsBridgeManifest } from '../../packages/cms/src/module/bridge-manifest.js'

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const target = resolve(rootDir, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

export async function installBridge(rootDir: string) {
  const files = await renderComponentBridgeFiles(ginkoCmsBridgeManifest)
  for (const file of files) {
    writeFile(rootDir, file.relativePath, renderComponentBridgeFile(ginkoCmsBridgeManifest, file))
  }

  const edits = await renderComponentBridgeManagedEdits(ginkoCmsBridgeManifest)
  for (const edit of edits) {
    const existing = readIfExists(resolve(rootDir, edit.relativePath))
    writeFile(rootDir, edit.relativePath, edit.apply(existing))
  }
}
