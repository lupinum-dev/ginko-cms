import type { JSONContent } from '@tiptap/vue-3'

import type { ConversionIssue, ConversionPhase } from './conversionTypes'

const INLINE_NODE_TYPES = new Set([
  'binding',
  'emoji',
  'hardBreak',
  'inline-element',
  'span-style',
  'text',
])

const BLOCK_NODE_TYPES = new Set([
  'blockquote',
  'bulletList',
  'codeBlock',
  'comment',
  'element',
  'file',
  'heading',
  'horizontalRule',
  'image',
  'listItem',
  'orderedList',
  'paragraph',
  'slot',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
  'video',
])

function issue(
  code: string,
  message: string,
  context?: Record<string, unknown>,
  severity: 'error' | 'warn' = 'error',
  phase: ConversionPhase = 'validate',
): ConversionIssue {
  return {
    code,
    context,
    message,
    phase,
    severity,
  }
}

function isInlineType(type: string) {
  return INLINE_NODE_TYPES.has(type)
}

function isBlockType(type: string) {
  return BLOCK_NODE_TYPES.has(type)
}

function isKnownType(type: string) {
  return isInlineType(type) || isBlockType(type)
}

function validateNode(
  node: JSONContent,
  issues: ConversionIssue[],
  parentType: null | string,
  depth: number,
) {
  if (!node || typeof node !== 'object') {
    issues.push(issue('invalid_node_shape', 'Node is not a valid object', { depth, parentType }))
    return
  }

  if (!node.type || typeof node.type !== 'string') {
    issues.push(issue('missing_node_type', 'Node is missing a valid "type"', { depth, parentType }))
    return
  }

  if (!isKnownType(node.type)) {
    issues.push(
      issue('unknown_node_type', `Unknown node type "${node.type}"`, {
        depth,
        nodeType: node.type,
        parentType,
      }),
    )
  }

  if (node.type === 'text') {
    if (typeof node.text !== 'string') {
      issues.push(
        issue('invalid_text_node', 'Text node is missing string text', { depth, parentType }),
      )
    }
    if (Array.isArray(node.content) && node.content.length > 0) {
      issues.push(
        issue('text_node_has_children', 'Text node must not contain child content', {
          depth,
          parentType,
        }),
      )
    }
    return
  }

  if (node.type === 'paragraph') {
    const content = Array.isArray(node.content) ? node.content : []
    for (const child of content) {
      const childType = child?.type
      if (!childType || !isInlineType(childType)) {
        issues.push(
          issue('block_inside_paragraph', 'Paragraph contains non-inline child node', {
            childType: childType ?? null,
            depth,
          }),
        )
      }
    }
  }

  if (node.type === 'listItem') {
    const content = Array.isArray(node.content) ? node.content : []
    if (content.length === 0) {
      issues.push(
        issue('list_item_empty', 'List item must contain at least one child node', { depth }),
      )
    }
    if (content[0]?.type !== 'paragraph') {
      issues.push(
        issue('list_item_first_child_not_paragraph', 'List item must start with paragraph node', {
          depth,
          firstChildType: content[0]?.type ?? null,
        }),
      )
    }
  }

  if (!Array.isArray(node.content)) {
    return
  }

  for (const child of node.content) {
    validateNode(child, issues, node.type, depth + 1)
  }
}

export function validateTiptapDocShape(doc: JSONContent): ConversionIssue[] {
  const issues: ConversionIssue[] = []

  if (!doc || typeof doc !== 'object') {
    issues.push(issue('invalid_doc_shape', 'Document payload is not a valid object'))
    return issues
  }

  if (doc.type !== 'doc') {
    issues.push(
      issue('invalid_doc_root_type', 'Root document type must be "doc"', {
        actual: doc.type ?? null,
      }),
    )
  }

  if (!Array.isArray(doc.content)) {
    issues.push(issue('missing_doc_content', 'Root document must contain a content array'))
    return issues
  }

  if (doc.content.length === 0) {
    issues.push(issue('empty_doc', 'Root document content is empty', undefined, 'warn'))
    return issues
  }

  for (const child of doc.content) {
    if (child?.type && isInlineType(child.type)) {
      issues.push(
        issue('inline_node_at_root', 'Inline node found at document root', {
          childType: child.type,
        }),
      )
    }
    validateNode(child, issues, 'doc', 1)
  }

  return issues
}
