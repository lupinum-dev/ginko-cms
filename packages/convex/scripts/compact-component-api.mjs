import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

// Convex 1.42 emits component APIs from serialized validators, which no longer
// contain the source's aliases. Factor only its exact finite JSON recurrence;
// keep the runtime validator and every other generated API type unchanged.
export function compactComponentApi(source) {
  const file = ts.createSourceFile('component.ts', source, ts.ScriptTarget.Latest, true)
  if (file.parseDiagnostics.length) throw new Error('Cannot compact invalid generated TypeScript.')
  const depths = new WeakMap()
  function depth(node) {
    if (depths.has(node)) return depths.get(node)
    let result
    if (ts.isUnionTypeNode(node) && [4, 6].includes(node.types.length)) {
      const scalars = new Set(node.types.map((part) => part.kind))
      const nulls = node.types.filter(
        (part) => ts.isLiteralTypeNode(part) && part.literal.kind === ts.SyntaxKind.NullKeyword,
      )
      const primitives = [
        ts.SyntaxKind.BooleanKeyword,
        ts.SyntaxKind.NumberKeyword,
        ts.SyntaxKind.StringKeyword,
      ]
      if (nulls.length === 1 && primitives.every((kind) => scalars.has(kind))) {
        if (node.types.length === 4) result = 0
        else {
          const array = node.types.find(
            (part) =>
              ts.isTypeReferenceNode(part) &&
              ts.isIdentifier(part.typeName) &&
              part.typeName.text === 'Array' &&
              part.typeArguments?.length === 1,
          )
          const record = node.types.find(
            (part) =>
              ts.isTypeReferenceNode(part) &&
              ts.isIdentifier(part.typeName) &&
              part.typeName.text === 'Record' &&
              part.typeArguments?.length === 2 &&
              part.typeArguments[0].kind === ts.SyntaxKind.StringKeyword,
          )
          if (array && record) {
            const child = depth(array.typeArguments[0])
            if (child !== undefined && child === depth(record.typeArguments[1])) result = child + 1
          }
        }
      }
    }
    depths.set(node, result)
    return result
  }
  const edits = []
  let maximum = 0
  function visit(node) {
    const current = depth(node)
    if (current > 0) {
      maximum = Math.max(maximum, current)
      edits.push({
        start: node.getStart(file),
        end: node.end,
        text: `_GinkoCmsJsonDepth${current}`,
      })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (!edits.length) return source
  if (source.includes('_GinkoCmsJsonDepth')) throw new Error('Generated JSON alias name collision.')
  let result = source
  for (const edit of edits.reverse())
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  const aliases = ['type _GinkoCmsJsonDepth0 = null | boolean | number | string;']
  for (let value = 1; value <= maximum; value++) {
    const child = `_GinkoCmsJsonDepth${value - 1}`
    aliases.push(
      `type _GinkoCmsJsonDepth${value} = _GinkoCmsJsonDepth0 | Array<${child}> | Record<string, ${child}>;`,
    )
  }
  // These names and depths are derived from this generated file, never from a
  // separately maintained schema. No public alias or runtime code is added.
  return (
    result +
    '\n// Finite JSON aliases factored by compact-component-api.mjs.\n' +
    aliases.join('\n') +
    '\n'
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = new URL('../src/_generated/component.ts', import.meta.url)
  const before = await readFile(path, 'utf8')
  const after = compactComponentApi(before)
  await writeFile(path, after)
  console.log(
    `Component API: ${Buffer.byteLength(before)} → ${Buffer.byteLength(after)} bytes; runtime validators unchanged.`,
  )
}
