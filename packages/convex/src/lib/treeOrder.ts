export type OrderedTreeRow<T> = {
  row: T
  depth: number
}

export function orderTreeRows<T>(
  rows: readonly T[],
  args: {
    getId: (row: T) => string
    getParentId: (row: T) => string | null
    compareSiblings: (left: T, right: T) => number
  },
): Array<OrderedTreeRow<T>> {
  const ids = new Set(rows.map(args.getId))
  const childrenByParent = new Map<string | null, T[]>()

  for (const row of rows) {
    const parentId = args.getParentId(row)
    const effectiveParentId = parentId && ids.has(parentId) ? parentId : null
    const siblings = childrenByParent.get(effectiveParentId) ?? []
    siblings.push(row)
    childrenByParent.set(effectiveParentId, siblings)
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(args.compareSiblings)
  }

  const ordered: Array<OrderedTreeRow<T>> = []
  const visited = new Set<string>()

  function visit(row: T, depth: number) {
    const id = args.getId(row)
    if (visited.has(id)) return
    visited.add(id)
    ordered.push({ row, depth })

    for (const child of childrenByParent.get(id) ?? []) {
      visit(child, depth + 1)
    }
  }

  for (const root of childrenByParent.get(null) ?? []) {
    visit(root, 0)
  }

  return ordered
}
