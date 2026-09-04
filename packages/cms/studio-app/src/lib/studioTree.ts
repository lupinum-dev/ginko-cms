import { compareOrderRank } from '@public/utils/cmsFields'

export type StudioTreeInputRow = {
  _id: string
  parentEntryId: string | null
  orderRank: string
  path: string
}

export type StudioTreeOrderedRow<T extends StudioTreeInputRow> = T & {
  depth: number
}

export function orderStudioTreeRows<T extends StudioTreeInputRow>(
  rows: readonly T[],
): Array<StudioTreeOrderedRow<T>> {
  const ids = new Set(rows.map((row) => row._id))
  const childrenByParent = new Map<string | null, T[]>()

  for (const row of rows) {
    const parentId = row.parentEntryId && ids.has(row.parentEntryId) ? row.parentEntryId : null
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(row)
    childrenByParent.set(parentId, siblings)
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => {
      const rank = compareOrderRank(left.orderRank, right.orderRank)
      if (rank !== 0) return rank
      return left.path.localeCompare(right.path)
    })
  }

  const ordered: Array<StudioTreeOrderedRow<T>> = []
  const visited = new Set<string>()

  function visit(row: T, depth: number) {
    if (visited.has(row._id)) return
    visited.add(row._id)
    ordered.push({ ...row, depth })
    for (const child of childrenByParent.get(row._id) ?? []) {
      visit(child, depth + 1)
    }
  }

  for (const root of childrenByParent.get(null) ?? []) {
    visit(root, 0)
  }

  return ordered
}
