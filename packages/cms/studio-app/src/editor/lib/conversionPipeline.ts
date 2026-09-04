import type { Editor } from '@tiptap/core'
import { createDocument } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { JSONContent } from '@tiptap/vue-3'

import { validateTiptapDocShape } from './conversionInvariants'
import { finishTrace, logIssue, logPhase, startTrace } from './conversionLogger'
import type {
  ConversionIssue,
  ConversionPhase,
  ConversionResult,
  ConversionSeverity,
} from './conversionTypes'
import { parseMdc, stringifyMdc } from './markdown'
import { mdcToTiptap } from './mdcToTiptap'
import type { TiptapToMDCOptions } from './tiptapToMdc'
import { tiptapToMDC } from './tiptapToMdc'

export type {
  ConversionErrorPayload,
  ConversionHealthState,
  ConversionIssue,
  ConversionPhase,
  ConversionRecoveredPayload,
  ConversionResult,
  ConversionSeverity,
  ConversionTraceEvent,
} from './conversionTypes'

function buildIssue(
  phase: ConversionPhase,
  code: string,
  message: string,
  detail?: unknown,
  context?: Record<string, unknown>,
  severity: ConversionSeverity = 'error',
): ConversionIssue {
  return {
    code,
    context,
    detail,
    message,
    phase,
    severity,
  }
}

function success<T>(
  traceId: string,
  issues: ConversionIssue[],
  timeline: ReturnType<typeof finishTrace>,
  value: T,
  fallbackUsed = false,
): ConversionResult<T> {
  return {
    fallbackUsed,
    issues,
    ok: true,
    timeline,
    traceId,
    value,
  }
}

function failure<T>(
  traceId: string,
  issues: ConversionIssue[],
  timeline: ReturnType<typeof finishTrace>,
  fallbackUsed = false,
): ConversionResult<T> {
  return {
    fallbackUsed,
    issues,
    ok: false,
    timeline,
    traceId,
  }
}

function splitIssues(issues: ConversionIssue[]) {
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warn')
  return { errors, warnings }
}

export async function convertMarkdownToTiptapDoc(
  markdown: string,
): Promise<ConversionResult<JSONContent>> {
  const trace = startTrace({
    direction: 'markdown_to_tiptap',
  })
  const issues: ConversionIssue[] = []

  logPhase(trace, 'parse_mdc', { inputLength: markdown.length })

  let ast: Awaited<ReturnType<typeof parseMdc>>
  try {
    ast = await parseMdc(markdown, { strict: true })
  } catch (error) {
    const issue = buildIssue(
      'parse_mdc',
      'parse_mdc_failed',
      'Failed to parse MDC markdown',
      error,
      {
        inputLength: markdown.length,
        preview: markdown.slice(0, 200),
      },
    )
    issues.push(issue)
    logIssue(trace, issue)
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  logPhase(trace, 'mdc_to_tiptap')

  let doc: JSONContent
  try {
    doc = mdcToTiptap(ast)
  } catch (error) {
    const issue = buildIssue(
      'mdc_to_tiptap',
      'mdc_to_tiptap_failed',
      'Failed to convert MDC AST to TipTap JSON',
      error,
    )
    issues.push(issue)
    logIssue(trace, issue)
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  logPhase(trace, 'validate')
  const invariantIssues = validateTiptapDocShape(doc)
  for (const invariantIssue of invariantIssues) {
    issues.push(invariantIssue)
    logIssue(trace, invariantIssue)
  }

  const { errors } = splitIssues(issues)
  if (errors.length > 0) {
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  return success(trace.traceId, issues, finishTrace(trace, { status: 'ok' }), doc)
}

export async function convertTiptapDocToMarkdown(
  doc: JSONContent,
  options?: TiptapToMDCOptions,
): Promise<ConversionResult<string>> {
  const trace = startTrace({
    direction: 'tiptap_to_markdown',
  })
  const issues: ConversionIssue[] = []

  logPhase(trace, 'validate')
  const invariantIssues = validateTiptapDocShape(doc)
  for (const invariantIssue of invariantIssues) {
    issues.push(invariantIssue)
    logIssue(trace, invariantIssue)
  }

  const invariantErrors = invariantIssues.filter((issue) => issue.severity === 'error')
  if (invariantErrors.length > 0) {
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  logPhase(trace, 'tiptap_to_mdc')
  let ast: Awaited<ReturnType<typeof tiptapToMDC>>
  try {
    ast = await tiptapToMDC(doc, options)
  } catch (error) {
    const issue = buildIssue(
      'tiptap_to_mdc',
      'tiptap_to_mdc_failed',
      'Failed to convert TipTap JSON to MDC AST',
      error,
    )
    issues.push(issue)
    logIssue(trace, issue)
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  logPhase(trace, 'stringify_mdc')
  let markdown: string
  try {
    markdown = await stringifyMdc(ast, {
      strict: true,
      videoOutput: options?.videoOutput,
    })
  } catch (error) {
    const issue = buildIssue(
      'stringify_mdc',
      'stringify_mdc_failed',
      'Failed to stringify MDC AST to markdown',
      error,
    )
    issues.push(issue)
    logIssue(trace, issue)
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  return success(trace.traceId, issues, finishTrace(trace, { status: 'ok' }), markdown)
}

export function applyTiptapDocToEditor(
  editor: Editor,
  doc: JSONContent,
): ConversionResult<JSONContent> {
  const trace = startTrace({
    direction: 'tiptap_to_editor',
  })
  const issues: ConversionIssue[] = []

  logPhase(trace, 'validate')
  const invariantIssues = validateTiptapDocShape(doc)
  for (const invariantIssue of invariantIssues) {
    issues.push(invariantIssue)
    logIssue(trace, invariantIssue)
  }

  const invariantErrors = invariantIssues.filter((issue) => issue.severity === 'error')
  if (invariantErrors.length > 0) {
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  logPhase(trace, 'set_content')
  try {
    const nextDoc = createDocument(doc, editor.schema)

    // Echo guard: applying content that matches the current document (e.g. the
    // autosave round-trip writing our own value back) must not touch the doc,
    // undo history, selection, or focus.
    if (nextDoc.eq(editor.state.doc)) {
      return success(trace.traceId, issues, finishTrace(trace, { status: 'ok' }), doc)
    }

    // External content replaces the document outside the undo history, so a
    // single undo never jumps past the reset to an empty editor. Selection and
    // focus are preserved for a writer who is mid-edit.
    const { from, to } = editor.state.selection
    const wasFocused = editor.isFocused
    const tr = editor.state.tr
      .replaceWith(0, editor.state.doc.content.size, nextDoc.content)
      .setMeta('addToHistory', false)
    tr.setSelection(
      TextSelection.between(
        tr.doc.resolve(Math.min(from, tr.doc.content.size)),
        tr.doc.resolve(Math.min(to, tr.doc.content.size)),
      ),
    )
    editor.view.dispatch(tr)
    if (wasFocused && !editor.isFocused) {
      editor.view.focus()
    }
  } catch (error) {
    const issue = buildIssue(
      'set_content',
      'set_content_failed',
      'Failed to apply TipTap JSON to editor',
      error,
    )
    issues.push(issue)
    logIssue(trace, issue)
    return failure(trace.traceId, issues, finishTrace(trace, { status: 'failed' }))
  }

  return success(trace.traceId, issues, finishTrace(trace, { status: 'ok' }), doc)
}

export async function applyMarkdownToEditor(
  editor: Editor,
  markdown: string,
): Promise<ConversionResult<JSONContent>> {
  const conversion = await convertMarkdownToTiptapDoc(markdown)
  if (!conversion.ok || !conversion.value) {
    return conversion
  }

  const applyResult = applyTiptapDocToEditor(editor, conversion.value)
  const merged = {
    fallbackUsed: conversion.fallbackUsed || applyResult.fallbackUsed,
    issues: [...conversion.issues, ...applyResult.issues],
    timeline: [...conversion.timeline, ...applyResult.timeline],
    traceId: conversion.traceId,
  }

  if (!applyResult.ok) {
    return {
      ...merged,
      ok: false,
    }
  }

  return {
    ...merged,
    ok: true,
    value: conversion.value,
  }
}
