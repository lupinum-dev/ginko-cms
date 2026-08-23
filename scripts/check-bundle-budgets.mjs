import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const budgets = {
  generatedComponentBytes: 40_000_000,
  generatedApiBytes: 100_000,
  studioTotalBytes: 2_750_000,
  studioMainChunkBytes: 600_000,
  studioEditorChunkBytes: 900_000,
  studioOtherChunkBytes: 600_000,
}

function fileSize(relativePath) {
  return statSync(resolve(repoRoot, relativePath)).size
}

function assertWithin(label, actual, budget) {
  if (actual <= budget) return
  throw new Error(
    `${label} is ${actual.toLocaleString()} bytes; budget is ${budget.toLocaleString()}.`,
  )
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? walkFiles(path) : [path]
  })
}

const generatedComponentBytes = fileSize('packages/convex/src/_generated/component.ts')
const generatedApiBytes = fileSize('packages/convex/src/_generated/api.ts')
assertWithin(
  'Generated Convex component contract',
  generatedComponentBytes,
  budgets.generatedComponentBytes,
)
assertWithin('Generated Convex API contract', generatedApiBytes, budgets.generatedApiBytes)

const studioRoot = resolve(repoRoot, 'packages/cms/dist/studio-app')
const studioFiles = walkFiles(studioRoot)
const studioTotalBytes = studioFiles.reduce((total, path) => total + statSync(path).size, 0)
assertWithin('Studio production bundle', studioTotalBytes, budgets.studioTotalBytes)

for (const path of studioFiles.filter((candidate) => candidate.endsWith('.js'))) {
  const filename = path.slice(path.lastIndexOf('/') + 1)
  const size = statSync(path).size
  if (filename === 'main.js') {
    assertWithin('Studio main JavaScript chunk', size, budgets.studioMainChunkBytes)
  } else if (/^(?:Editor|FieldRichtext)-/u.test(filename)) {
    assertWithin('Lazy rich-text editor chunk', size, budgets.studioEditorChunkBytes)
  } else {
    assertWithin(`Studio JavaScript chunk ${filename}`, size, budgets.studioOtherChunkBytes)
  }
}

console.log(
  [
    `Bundle budgets pass: generated component ${generatedComponentBytes.toLocaleString()}/${budgets.generatedComponentBytes.toLocaleString()} bytes`,
    `generated API ${generatedApiBytes.toLocaleString()}/${budgets.generatedApiBytes.toLocaleString()} bytes`,
    `Studio ${studioTotalBytes.toLocaleString()}/${budgets.studioTotalBytes.toLocaleString()} bytes`,
  ].join('; '),
)
