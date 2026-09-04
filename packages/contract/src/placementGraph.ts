/**
 * Product-wide placement policy. A root node is depth one.
 */
export const CMS_TREE_MAX_DEPTH = 5

export type FinalPlacementNode = {
  key: string
  collection: string
  parentKey: string | null
  structure: 'flat' | 'tree'
}

/**
 * Validate a complete final placement graph, independent of mutation order.
 * Callers must include every referenced parent in `nodes`.
 */
export function assertValidFinalPlacementGraph(nodes: readonly FinalPlacementNode[]): void {
  const byKey = new Map<string, FinalPlacementNode>()
  for (const node of nodes) {
    if (byKey.has(node.key)) {
      throw new Error(`Final placement graph contains duplicate node "${node.key}".`)
    }
    byKey.set(node.key, node)
  }

  for (const node of nodes) {
    if (node.structure === 'flat' && node.parentKey !== null) {
      throw new Error(`Flat collection "${node.collection}" cannot contain parent placements.`)
    }
    if (node.parentKey === null) continue
    const parent = byKey.get(node.parentKey)
    if (!parent) {
      throw new Error(
        `Final placement graph node "${node.key}" references missing parent "${node.parentKey}".`,
      )
    }
    if (parent.collection !== node.collection) {
      throw new Error(`Final placement graph node "${node.key}" has a cross-collection parent.`)
    }
  }

  const visiting = new Set<string>()
  const depthByKey = new Map<string, number>()
  const depthOf = (key: string): number => {
    const known = depthByKey.get(key)
    if (known !== undefined) return known
    if (visiting.has(key)) {
      throw new Error(`Final placement graph contains a cycle at "${key}".`)
    }
    visiting.add(key)
    const node = byKey.get(key)!
    const depth = node.parentKey === null ? 1 : depthOf(node.parentKey) + 1
    if (depth > CMS_TREE_MAX_DEPTH) {
      throw new Error(
        `Final placement graph exceeds the supported tree depth of ${CMS_TREE_MAX_DEPTH}.`,
      )
    }
    visiting.delete(key)
    depthByKey.set(key, depth)
    return depth
  }

  for (const node of nodes) depthOf(node.key)
}

export function finalPlacementKey(collection: string, canonicalKey: string): string {
  return `${collection}\u0000${canonicalKey}`
}

export function portableSharedDraftState<T>(document: {
  collection: string
  canonicalKey: string
  parentCanonicalKey: string | null
  order: string | null
  shared: T
}) {
  return {
    collection: document.collection,
    canonicalKey: document.canonicalKey,
    parentCanonicalKey: document.parentCanonicalKey,
    order: document.order,
    shared: document.shared,
  }
}
