import { isPlainObject as _isPlainObject } from '@lupinum/ginko-cms-contract/shared/utils.js'

export {
  structuredCloneSafe,
  isPlainObject,
  resolveContextValue,
  emptyForType,
} from '@lupinum/ginko-cms-contract/shared/utils.js'

export function extractTextFragments(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  if (Array.isArray(value)) return value.flatMap((item) => extractTextFragments(item))
  if (_isPlainObject(value))
    return Object.values(value).flatMap((item) => extractTextFragments(item))
  return []
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^([-*_]){3,}\s*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_~]+/g, '')
}
