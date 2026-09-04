import { readinessIssueMessage } from '../../../lib/publicWorkflow'
import type { StudioEntryReadinessDetail, StudioPublicVisibilityState } from './studioWorkflowTypes'

export type StudioRefreshDiagnostic = {
  key: string
  message: string
  severity?: string
}

export function isRefreshDiagnosticCode(code: string) {
  return code.startsWith('revalidation_') || code === 'projection_cache_tags_missing'
}

export function publicVisibilityDiagnosticsLoaded(visibility?: StudioPublicVisibilityState) {
  return Boolean(
    visibility &&
    !visibility.pending &&
    !visibility.error &&
    visibility.status !== 'Live status unknown' &&
    visibility.status !== 'Loading',
  )
}

export function collectPublicVisibilityRefreshDiagnostics(args: {
  publicVisibility?: StudioPublicVisibilityState
  localeFilter?: Set<string>
}) {
  const diagnostics: StudioRefreshDiagnostic[] = []
  for (const diagnostic of args.publicVisibility?.globalDiagnostics ?? []) {
    if (isRefreshDiagnosticCode(diagnostic.code)) {
      diagnostics.push({
        key: `global:${diagnostic.code}:${diagnostic.path ?? ''}`,
        message: diagnostic.message || diagnostic.code,
        severity: diagnostic.severity,
      })
    }
  }
  for (const row of args.publicVisibility?.localeRows ?? []) {
    if (args.localeFilter && !args.localeFilter.has(row.locale)) continue
    for (const diagnostic of [...row.visibleDiagnostics, ...row.diagnostics]) {
      if (isRefreshDiagnosticCode(diagnostic.code)) {
        diagnostics.push({
          key: `${row.locale}:${diagnostic.code}:${diagnostic.path ?? ''}`,
          message: diagnostic.message || diagnostic.code,
          severity: diagnostic.severity,
        })
      }
    }
  }
  return dedupeRefreshDiagnostics(diagnostics)
}

export function collectReadinessRefreshDiagnostics(args: {
  readinessDetail?: StudioEntryReadinessDetail | null
  t: (key: string, params?: Record<string, unknown>) => string
}) {
  const diagnostics: StudioRefreshDiagnostic[] = []
  for (const locale of args.readinessDetail?.locales ?? []) {
    for (const issue of [...locale.blockers, ...locale.warnings, ...locale.infos]) {
      if (isRefreshDiagnosticCode(issue.code)) {
        diagnostics.push({
          key: `${locale.locale}:${issue.code}:${issue.fieldPath ?? ''}`,
          message: readinessIssueMessage(args.t, issue),
          severity: issue.severity,
        })
      }
    }
  }
  return dedupeRefreshDiagnostics(diagnostics)
}

export function dedupeRefreshDiagnostics(diagnostics: StudioRefreshDiagnostic[]) {
  const seen = new Set<string>()
  return diagnostics.filter((diagnostic) => {
    if (seen.has(diagnostic.key)) return false
    seen.add(diagnostic.key)
    return true
  })
}
