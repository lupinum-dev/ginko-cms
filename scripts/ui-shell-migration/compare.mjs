// `ui-audit compare` — pixel-diff two capture directories by matching filename.
//
// pixelmatch + pngjs are imported dynamically so this file still loads (and the
// CLI --help works) even when those devDependencies are not yet installed.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

/**
 * @param {{baselineDir:string, candidateDir:string, diffDir:string, threshold:number}} opts
 */
export async function runCompare(opts) {
  const baselineDir = resolve(opts.baselineDir)
  const candidateDir = resolve(opts.candidateDir)
  const diffDir = resolve(opts.diffDir)
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.1

  let pixelmatch
  let PNG
  try {
    ;({ default: pixelmatch } = await import('pixelmatch'))
    ;({ PNG } = await import('pngjs'))
  } catch (error) {
    throw new Error(
      'compare requires the "pixelmatch" and "pngjs" packages. Install them at the repo root: ' +
        '`pnpm add -D -w pixelmatch pngjs`. Original error: ' +
        (error instanceof Error ? error.message : String(error)),
    )
  }

  await mkdir(diffDir, { recursive: true })

  const baseFiles = await pngSet(baselineDir)
  const candFiles = await pngSet(candidateDir)

  const allNames = new Set([...baseFiles, ...candFiles])
  const results = []
  const counts = { identical: 0, changed: 0, added: 0, removed: 0, total: 0 }

  for (const name of [...allNames].sort()) {
    counts.total += 1
    const inBase = baseFiles.has(name)
    const inCand = candFiles.has(name)

    if (inBase && !inCand) {
      counts.removed += 1
      results.push({ file: name, status: 'removed' })
      continue
    }
    if (!inBase && inCand) {
      counts.added += 1
      results.push({ file: name, status: 'added' })
      continue
    }

    const [baseImg, candImg] = await Promise.all([
      loadPng(PNG, join(baselineDir, name)),
      loadPng(PNG, join(candidateDir, name)),
    ])

    const width = Math.max(baseImg.width, candImg.width)
    const height = Math.max(baseImg.height, candImg.height)
    const dimensionMismatch = baseImg.width !== candImg.width || baseImg.height !== candImg.height

    const a = padTo(PNG, baseImg, width, height)
    const b = padTo(PNG, candImg, width, height)
    const diff = new PNG({ width, height })

    const diffPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
      threshold,
      alpha: 0.2,
      includeAA: false,
    })
    const totalPixels = width * height
    const percentChanged = totalPixels === 0 ? 0 : (diffPixels / totalPixels) * 100

    const changed = diffPixels > 0 || dimensionMismatch
    if (changed) {
      counts.changed += 1
      await writeFile(join(diffDir, name), PNG.sync.write(diff))
    } else {
      counts.identical += 1
    }

    results.push({
      file: name,
      status: changed ? 'changed' : 'identical',
      width,
      height,
      dimensionMismatch,
      baseline: { width: baseImg.width, height: baseImg.height },
      candidate: { width: candImg.width, height: candImg.height },
      diffPixels,
      totalPixels,
      percentChanged: Number(percentChanged.toFixed(4)),
      diffFile: changed ? name : null,
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baselineDir,
    candidateDir,
    diffDir,
    threshold,
    counts,
    results,
  }
  await writeFile(join(diffDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

  console.log(
    `compare: ${counts.identical} identical, ${counts.changed} changed, ` +
      `${counts.added} added, ${counts.removed} removed (of ${counts.total}).`,
  )
  const worst = results
    .filter((r) => r.status === 'changed')
    .sort((x, y) => y.percentChanged - x.percentChanged)
    .slice(0, 10)
  for (const r of worst) {
    const dim = r.dimensionMismatch ? ' [dimension mismatch]' : ''
    console.log(`  changed ${r.file}: ${r.percentChanged}% (${r.diffPixels}px)${dim}`)
  }
  for (const r of results.filter((r) => r.status === 'added')) {
    console.log(`  added   ${r.file}`)
  }
  for (const r of results.filter((r) => r.status === 'removed')) {
    console.log(`  removed ${r.file}`)
  }
  console.log(`report: ${join(diffDir, 'report.json')}`)
}

async function pngSet(dir) {
  let entries = []
  try {
    entries = await readdir(dir)
  } catch (error) {
    throw new Error(`cannot read directory ${dir}: ${error instanceof Error ? error.message : error}`)
  }
  return new Set(entries.filter((f) => f.toLowerCase().endsWith('.png')).map((f) => basename(f)))
}

async function loadPng(PNG, filePath) {
  const buf = await readFile(filePath)
  return PNG.sync.read(buf)
}

/** Return an image of exactly width x height, top-left aligning the source over transparent. */
function padTo(PNG, img, width, height) {
  if (img.width === width && img.height === height) return img
  const out = new PNG({ width, height, fill: true })
  // fill: true zeroes the buffer (transparent black). Copy source rows in.
  for (let y = 0; y < img.height && y < height; y++) {
    for (let x = 0; x < img.width && x < width; x++) {
      const si = (img.width * y + x) << 2
      const di = (width * y + x) << 2
      out.data[di] = img.data[si]
      out.data[di + 1] = img.data[si + 1]
      out.data[di + 2] = img.data[si + 2]
      out.data[di + 3] = img.data[si + 3]
    }
  }
  return out
}
