import type { ExtendedRegExpMatchArray, nodeInputRule } from '@tiptap/core'
import { callOrReturn, InputRule } from '@tiptap/core'

type Config = Parameters<typeof nodeInputRule>[0] & {
  getText?: (match: ExtendedRegExpMatchArray) => string
}

export function textInputRule(config: Config) {
  return new InputRule({
    find: config.find,
    handler: ({ match, range, state }) => {
      if (!match[1]) {
        return
      }

      const attributes = callOrReturn(config.getAttributes, undefined, match) || {}
      const text = callOrReturn(config.getText, undefined, match) || ''
      const { tr } = state
      const start = range.from
      let end = range.to

      const newNode = config.type.create(attributes)

      const offset = match[0].lastIndexOf(match[1])
      let matchStart = start + offset

      if (matchStart > end) {
        matchStart = end
      } else {
        end = matchStart + match[1].length
      }

      const lastChar = match[0].at(-1)

      if (lastChar) {
        tr.insertText(lastChar, start + match[0].length - 1)
      }

      tr.replaceWith(matchStart, end, newNode)
      tr.insertText(text, matchStart + 1)

      tr.scrollIntoView()
    },
  })
}
