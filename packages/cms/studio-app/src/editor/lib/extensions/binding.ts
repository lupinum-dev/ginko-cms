import { InputRule, Node, type CommandProps } from '@tiptap/core'
import type { NodeType, Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'

export interface BindingAttrs {
  defaultValue?: null | string
  value?: null | string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    Binding: {
      setBinding: (attrs: BindingAttrs) => ReturnType
      unsetBinding: () => ReturnType
      updateBinding: (attrs: BindingAttrs) => ReturnType
    }
  }
}

const BINDING_INPUT_RULE_FIND = /\{\{([^|}]+)(?:\|\|([^}]+))?\}\}$/

function isValidAttr(value?: null | string): boolean {
  if (!value) {
    return false
  }
  const trimmed = String(value).trim()
  if (!trimmed) {
    return false
  }
  const lower = trimmed.toLowerCase()
  return lower !== 'null' && lower !== 'undefined'
}

function sanitize(attrs?: BindingAttrs): Record<string, string> {
  const cleaned: Record<string, string> = {}
  const value = attrs?.value
  const defaultValue = attrs?.defaultValue
  if (isValidAttr(value)) {
    cleaned.value = String(value).trim()
  }
  if (isValidAttr(defaultValue)) {
    cleaned.defaultValue = String(defaultValue).trim()
  }
  return cleaned
}

export const Binding = Node.create<BindingAttrs>({
  name: 'binding',
  inline: true,
  group: 'inline',
  atom: true,
  content: 'text*',

  addAttributes() {
    return {
      defaultValue: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('default-value'),
      },
      value: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('value'),
      },
    }
  },

  addCommands() {
    return {
      setBinding: createSetBindingCommand(this.type),
      unsetBinding: createUnsetBindingCommand(this.type),
      updateBinding: createUpdateBindingCommand(this.type),
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: BINDING_INPUT_RULE_FIND,
        handler: createBindingInputRuleHandler(this.type),
      }),
    ]
  },

  parseHTML() {
    return [{ tag: 'binding' }, { tag: 'span[data-type="binding"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['binding', HTMLAttributes, 0]
  },
})

function findCurrentBinding(
  state: EditorState,
  type: NodeType,
): null | { node: ProseMirrorNode; pos: number } {
  const { from, to } = state.selection
  let found: null | { node: ProseMirrorNode; pos: number } = null
  state.doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
    if (node.type === type) {
      found = { node, pos }
      return false
    }
    return undefined
  })
  return found
}

function createSetBindingCommand(type: NodeType) {
  return (attrs: BindingAttrs) => {
    return ({ chain, state }: CommandProps) => {
      const cleaned = sanitize(attrs)
      const { from } = state.selection
      const textValue = cleaned.value || cleaned.defaultValue
      const content = textValue ? [state.schema.text(textValue)] : undefined
      const node = type.create(cleaned, content)
      let tr = state.tr.insert(from, node)

      const posAfter = from + node.nodeSize
      const nextNode = tr.doc.nodeAt(posAfter)
      const needsSpace = !nextNode || (nextNode.isText && !(nextNode.text || '').startsWith(' '))
      if (needsSpace) {
        tr = tr.insert(posAfter, state.schema.text(' '))
      }

      const targetPos = needsSpace ? posAfter + 1 : posAfter
      tr = tr.setSelection(TextSelection.create(tr.doc, targetPos))

      return chain()
        .setMeta('preventAutofocus', true)
        .command(({ dispatch }: CommandProps) => {
          dispatch?.(tr)
          return true
        })
        .run()
    }
  }
}

function createUnsetBindingCommand(type: NodeType) {
  return () => {
    return ({ dispatch, state }: CommandProps) => {
      const target = findCurrentBinding(state as EditorState, type)
      if (!target) {
        return false
      }
      const { node, pos } = target
      const tr = state.tr.delete(Number(pos), Number(pos) + node.nodeSize)
      dispatch?.(tr)
      return true
    }
  }
}

function createUpdateBindingCommand(type: NodeType) {
  return (attrs: BindingAttrs) => {
    return ({ dispatch, state }: CommandProps) => {
      const cleaned = sanitize(attrs)
      const target = findCurrentBinding(state as EditorState, type)
      if (!target) {
        return false
      }
      const { node, pos } = target
      const tr = state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ...cleaned,
      })
      const start = Number(pos) + 1
      const end = Number(pos) + node.nodeSize - 1
      tr.delete(start, end)
      const textValue = cleaned.value || cleaned.defaultValue
      if (textValue) {
        tr.insert(start, state.schema.text(textValue))
      }
      dispatch?.(tr)
      return true
    }
  }
}

function createBindingInputRuleHandler(type: NodeType) {
  return ({ match, range, state }: Parameters<InputRule['handler']>[0]) => {
    const [, name, def] = match as RegExpMatchArray
    const attrs = sanitize({ defaultValue: def?.trim(), value: name?.trim() })
    const textValue = attrs.value || attrs.defaultValue
    const node = type.create(attrs, textValue ? state.schema.text(textValue) : undefined)

    let { tr } = state
    tr = tr.delete(range.from, range.to).insert(range.from, node)
    const posAfter = range.from + node.nodeSize
    const next = tr.doc.nodeAt(posAfter)
    if (!next || (next.isText && !(next.text || '').startsWith(' '))) {
      tr = tr.insertText(' ', posAfter)
    }

    tr.setSelection(TextSelection.create(tr.doc, posAfter + 1))
  }
}
