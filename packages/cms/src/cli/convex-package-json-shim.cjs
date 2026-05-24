const fs = require('node:fs')
const path = require('node:path')

const projectCwd = process.env.GINKO_CMS_CONVEX_PROJECT_CWD
const packageJsonPath = projectCwd ? path.resolve(projectCwd, 'package.json') : null

function shouldPatchPackageJson(filePath) {
  if (!packageJsonPath || typeof filePath !== 'string') return false
  return path.resolve(filePath) === packageJsonPath
}

function patchPackageJson(source) {
  const value = JSON.parse(source)
  value.peerDependencies = {
    ...(value.peerDependencies || {}),
    convex: value.peerDependencies?.convex || '*',
  }
  return JSON.stringify(value, null, 2)
}

function patchFile(filePath, result, options) {
  if (!shouldPatchPackageJson(filePath)) return result

  const encoding = typeof options === 'string' ? options : options?.encoding
  const source = Buffer.isBuffer(result) ? result.toString(encoding || 'utf8') : String(result)
  const patched = patchPackageJson(source)
  return Buffer.isBuffer(result) && !encoding ? Buffer.from(patched) : patched
}

const readFileSync = fs.readFileSync
fs.readFileSync = function ginkoCmsReadFileSync(filePath, options) {
  const result = readFileSync.call(this, filePath, options)
  return patchFile(filePath, result, options)
}

const readFile = fs.readFile
fs.readFile = function ginkoCmsReadFile(filePath, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = undefined
  }

  return readFile.call(this, filePath, options, (error, result) => {
    if (error || !shouldPatchPackageJson(filePath)) {
      callback(error, result)
      return
    }

    try {
      callback(null, patchFile(filePath, result, options))
    } catch (patchError) {
      callback(patchError)
    }
  })
}
