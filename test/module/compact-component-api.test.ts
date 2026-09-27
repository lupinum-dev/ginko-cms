import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { compactComponentApi } from '../../packages/convex/scripts/compact-component-api.mjs'

function json(depth: number): string {
  const scalar = 'null | boolean | number | string'
  return depth === 0
    ? scalar
    : `${scalar} | Array<${json(depth - 1)}> | Record<string, ${json(depth - 1)}>`
}

describe('finite JSON component type compaction', () => {
  it('is deterministic, idempotent, and preserves every non-JSON type', () => {
    const source = `// generated\nexport type Example = { id: string; optional?: ${json(8)}; strict: 1 | 2 };`
    const compact = compactComponentApi(source)
    expect(compact.length).toBeLessThan(source.length / 10)
    expect(compact).toContain('id: string; optional?: _GinkoCmsJsonDepth8; strict: 1 | 2')
    expect(compactComponentApi(source)).toBe(compact)
    expect(compactComponentApi(compact)).toBe(compact)
    expect(compact).not.toMatch(/\bany\b/)
  })

  it('retains exact assignability, optionality and finite depth for nested JSON', () => {
    const source = `export type Example = { optional?: ${json(3)}; value: ${json(8)}; scalar: ${json(0)} };`
    const directory = mkdtempSync(join(tmpdir(), 'cms-component-types-'))
    const file = join(directory, 'proof.ts')
    try {
      writeFileSync(
        file,
        `namespace Original { ${source} }\nnamespace Compacted { ${compactComponentApi(source)} }\n
        type Assert<T extends true> = T;
        type Forward = Assert<Original.Example extends Compacted.Example ? true : false>;
        type Backward = Assert<Compacted.Example extends Original.Example ? true : false>;
        const valid: Compacted.Example = { value: [{ a: [true, null] }], scalar: 3 };
        // @ts-expect-error A fourth array exceeds the optional value's original depth three.
        const tooDeep: Compacted.Example = { optional: [[[[0]]]], value: null, scalar: 0 };
        // @ts-expect-error Objects are not primitive JSON values.
        const scalar: Compacted.Example = { value: 0, scalar: {} };
        // @ts-expect-error Undefined is not a JSON value.
        const undefinedValue: Compacted.Example = { value: undefined, scalar: 0 };
      `,
      )
      const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        skipLibCheck: true,
        types: [],
      })
      const diagnostics = ts.getPreEmitDiagnostics(program)
      expect(
        diagnostics.map((value) => ts.flattenDiagnosticMessageText(value.messageText, '\n')),
      ).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('does not widen asymmetric arrays/records or unrelated unions', () => {
    const source = `type Value = null | boolean | number | string | Array<${json(0)}> | Record<string, number>;`
    expect(compactComponentApi(source)).toBe(source)
    expect(compactComponentApi('type Value = string | number | ArrayBuffer;')).toBe(
      'type Value = string | number | ArrayBuffer;',
    )
    expect(
      compactComponentApi('type Value = null | boolean | number | string | Array<string>;'),
    ).not.toContain('_GinkoCmsJsonDepth')
  })

  it('fails on invalid source or a colliding alias instead of guessing', () => {
    expect(() => compactComponentApi('type Bad = {')).toThrow('invalid generated TypeScript')
    expect(() =>
      compactComponentApi(`type _GinkoCmsJsonDepth1 = string; type Value = ${json(1)};`),
    ).toThrow('collision')
  })
})
