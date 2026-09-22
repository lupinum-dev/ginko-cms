import { decodeContentBodyAstJson } from '@lupinum/ginko-cms-contract/shared/publicContent.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function decodeEntry(value: unknown): unknown {
  if (!isRecord(value) || !Object.hasOwn(value, 'bodyAstJson')) return value
  if (Object.hasOwn(value, 'bodyAst') || typeof value.bodyAstJson !== 'string') {
    throw new TypeError('CMS_BODY_AST_INVALID: ambiguous article-body transport.')
  }
  const { bodyAstJson, ...entry } = value
  return { ...entry, bodyAst: decodeContentBodyAstJson(bodyAstJson) }
}

/** Normalize only known CMS entry locations; user content is never interpreted as transport. */
export function decodeCmsBodyTransport(operation: string, envelope: unknown): unknown {
  if (!isRecord(envelope) || !isRecord(envelope.result)) return envelope
  const result = envelope.result
  let decoded: Record<string, unknown>
  switch (operation) {
    case 'page':
      decoded = { ...result, page: decodeEntry(result.page) }
      break
    case 'singleton':
      decoded = { ...result, singleton: decodeEntry(result.singleton) }
      break
    case 'list':
      decoded = Array.isArray(result.entries)
        ? { ...result, entries: result.entries.map(decodeEntry) }
        : result
      break
    case 'search':
      decoded = Array.isArray(result.results)
        ? { ...result, results: result.results.map(decodeEntry) }
        : result
      break
    case 'surround':
      decoded = {
        ...result,
        ...(Array.isArray(result.previous) ? { previous: result.previous.map(decodeEntry) } : {}),
        ...(Array.isArray(result.next) ? { next: result.next.map(decodeEntry) } : {}),
      }
      break
    default:
      return envelope
  }
  return { ...envelope, result: decoded }
}
