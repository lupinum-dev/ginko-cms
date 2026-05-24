import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

import { pushEditorDebugEvent, serializeDebugPayload } from '../debug'

const editorDebugPluginKey = new PluginKey('editorDebug')

export const EditorDebug = Extension.create({
  name: 'editorDebug',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: editorDebugPluginKey,
        props: {
          handleClick(view, _pos, event) {
            logDomEvent('click', event, view)
            return false
          },
          handleDOMEvents: {
            beforeinput(view, event) {
              logInputEvent('beforeinput', event, view)
              return false
            },
            blur(view, event) {
              logDomEvent('blur', event, view)
              return false
            },
            compositionend(view, event) {
              logInputEvent('compositionend', event, view)
              return false
            },
            compositionstart(view, event) {
              logInputEvent('compositionstart', event, view)
              return false
            },
            compositionupdate(view, event) {
              logInputEvent('compositionupdate', event, view)
              return false
            },
            focus(view, event) {
              logDomEvent('focus', event, view)
              return false
            },
            input(view, event) {
              logInputEvent('input', event, view)
              return false
            },
            keydown(view, event) {
              logKeyboardEvent('keydown', event, view)
              return false
            },
            keyup(view, event) {
              logKeyboardEvent('keyup', event, view)
              return false
            },
            mousedown(view, event) {
              logPointerEvent('mousedown', event, view)
              return false
            },
            mouseup(view, event) {
              logPointerEvent('mouseup', event, view)
              return false
            },
          },
          handleDrop(view, event, slice, moved) {
            pushEditorDebugEvent({
              level: 'warn',
              message: 'Drop handled',
              payload: {
                coords: getPointerCoordinates(event),
                moved,
                selection: serializeSelection(view.state.selection),
                slice: serializeDebugPayload(slice?.toJSON?.()),
              },
              source: 'pm.drop',
            })
            return false
          },
          handlePaste(view, event, slice) {
            pushEditorDebugEvent({
              level: 'warn',
              message: 'Paste handled',
              payload: {
                clipboard: getClipboardData(event),
                selection: serializeSelection(view.state.selection),
                slice: serializeDebugPayload(slice?.toJSON?.()),
              },
              source: 'pm.paste',
            })
            return false
          },
        },
        appendTransaction(transactions, oldState, newState) {
          if (transactions.length === 0) {
            return null
          }

          const changed = transactions.some((transaction) => transaction.docChanged)
          const selectionChanged =
            oldState.selection.from !== newState.selection.from ||
            oldState.selection.to !== newState.selection.to ||
            oldState.selection.empty !== newState.selection.empty

          pushEditorDebugEvent({
            level: changed ? 'warn' : 'log',
            message: changed
              ? 'Transaction batch changed document'
              : 'Transaction batch updated state',
            payload: {
              docAfter: summarizeDoc(newState.doc),
              docBefore: summarizeDoc(oldState.doc),
              selectionAfter: serializeSelection(newState.selection),
              selectionBefore: serializeSelection(oldState.selection),
              selectionChanged,
              transactions: transactions.map((transaction) => ({
                docChanged: transaction.docChanged,
                metaKeys: getTransactionMetaKeys(transaction),
                selectionSet: transaction.selectionSet,
                steps: transaction.steps.map((step) => serializeDebugPayload(step.toJSON())),
              })),
            },
            source: 'pm.transaction-batch',
          })

          return null
        },
        view() {
          return {
            update(currentView, previousState) {
              const selectionChanged =
                previousState.selection.from !== currentView.state.selection.from ||
                previousState.selection.to !== currentView.state.selection.to ||
                previousState.selection.empty !== currentView.state.selection.empty
              const docChanged = !previousState.doc.eq(currentView.state.doc)

              if (!selectionChanged && !docChanged) {
                return
              }

              pushEditorDebugEvent({
                level: docChanged ? 'warn' : 'log',
                message: docChanged
                  ? 'Editor view updated after document change'
                  : 'Editor view updated after selection change',
                payload: {
                  doc: summarizeDoc(currentView.state.doc),
                  selection: serializeSelection(currentView.state.selection),
                  selectionChanged,
                },
                source: 'pm.view.update',
              })
            },
          }
        },
      }),
    ]
  },
})

function serializeSelection(selection: { empty: boolean; from: number; to: number }) {
  return {
    empty: selection.empty,
    from: selection.from,
    to: selection.to,
  }
}

function summarizeDoc(doc: { childCount: number; content: { size: number }; textContent: string }) {
  return {
    childCount: doc.childCount,
    size: doc.content.size,
    textLength: doc.textContent.length,
  }
}

function logDomEvent(
  name: string,
  event: Event,
  view: {
    state: {
      doc: { childCount: number; content: { size: number }; textContent: string }
      selection: { empty: boolean; from: number; to: number }
    }
  },
) {
  pushEditorDebugEvent({
    level: 'log',
    message: `DOM ${name}`,
    payload: {
      doc: summarizeDoc(view.state.doc),
      selection: serializeSelection(view.state.selection),
      type: event.type,
    },
    source: `pm.dom.${name}`,
  })
}

function logInputEvent(
  name: string,
  event: Event,
  view: {
    state: {
      doc: { childCount: number; content: { size: number }; textContent: string }
      selection: { empty: boolean; from: number; to: number }
    }
  },
) {
  const inputEvent = event as InputEvent
  pushEditorDebugEvent({
    level: 'log',
    message: `Input ${name}`,
    payload: {
      data: inputEvent.data ?? null,
      doc: summarizeDoc(view.state.doc),
      inputType: inputEvent.inputType ?? null,
      isComposing: inputEvent.isComposing ?? false,
      selection: serializeSelection(view.state.selection),
      type: event.type,
    },
    source: `pm.input.${name}`,
  })
}

function logKeyboardEvent(
  name: string,
  event: Event,
  view: { state: { selection: { empty: boolean; from: number; to: number } } },
) {
  const keyboardEvent = event as KeyboardEvent
  pushEditorDebugEvent({
    level: 'log',
    message: `Keyboard ${name}`,
    payload: {
      altKey: keyboardEvent.altKey,
      code: keyboardEvent.code,
      ctrlKey: keyboardEvent.ctrlKey,
      key: keyboardEvent.key,
      metaKey: keyboardEvent.metaKey,
      selection: serializeSelection(view.state.selection),
      shiftKey: keyboardEvent.shiftKey,
    },
    source: `pm.keyboard.${name}`,
  })
}

function logPointerEvent(
  name: string,
  event: Event,
  view: { state: { selection: { empty: boolean; from: number; to: number } } },
) {
  const mouseEvent = event as MouseEvent
  pushEditorDebugEvent({
    level: 'log',
    message: `Pointer ${name}`,
    payload: {
      button: mouseEvent.button,
      buttons: mouseEvent.buttons,
      coords: getPointerCoordinates(mouseEvent),
      detail: mouseEvent.detail,
      selection: serializeSelection(view.state.selection),
    },
    source: `pm.pointer.${name}`,
  })
}

function getPointerCoordinates(event: { clientX?: number; clientY?: number }) {
  return {
    clientX: event.clientX ?? null,
    clientY: event.clientY ?? null,
  }
}

function getClipboardData(event: ClipboardEvent) {
  const html = event.clipboardData?.getData('text/html') ?? ''
  const text = event.clipboardData?.getData('text/plain') ?? ''

  return {
    htmlLength: html.length,
    htmlPreview: html.slice(0, 180),
    textLength: text.length,
    textPreview: text.slice(0, 180),
  }
}

function getTransactionMetaKeys(transaction: object) {
  const meta = Reflect.get(transaction, 'meta')
  return meta && typeof meta === 'object' ? Object.keys(meta as Record<string, unknown>) : []
}
