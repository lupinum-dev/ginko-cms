import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && /\.(?:mjs|ts)$/u.test(entry.name) ? [path] : []
  })
}

function literalArguments(expression: ts.ArrayLiteralExpression): string[] {
  return expression.elements.filter(ts.isStringLiteral).map((element) => element.text)
}

describe('isolated pnpm consumer installs', () => {
  it('always fails closed on peer dependency issues', () => {
    const violations: string[] = []

    for (const path of [...sourceFiles('scripts'), ...sourceFiles('test')]) {
      const source = readFileSync(path, 'utf8')
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          for (let index = 0; index < node.arguments.length - 1; index += 1) {
            const command = node.arguments[index]
            const argumentList = node.arguments[index + 1]
            if (!ts.isStringLiteral(command) || !ts.isArrayLiteralExpression(argumentList)) continue

            const args = literalArguments(argumentList)
            const isDirectInstall = command.text === 'pnpm' && args[0] === 'install'
            const isCorepackInstall =
              command.text === 'corepack' && args[0] === 'pnpm' && args[1] === 'install'
            if (
              (isDirectInstall || isCorepackInstall) &&
              !args.includes('--strict-peer-dependencies')
            ) {
              const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1
              violations.push(`${relative('.', path)}:${line}`)
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }

    expect(violations).toEqual([])
  })
})
