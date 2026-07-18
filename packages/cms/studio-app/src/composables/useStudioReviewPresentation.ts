import type { StudioReviewRequest } from '../lib/studioReviewRequests'
import { formatBoundedCount } from '../lib/websiteChangePresenter'
import { useCmsI18n } from './useCmsI18n'

type ReviewRequest = StudioReviewRequest

export type ReviewTone = 'danger' | 'neutral' | 'success' | 'warning'

export interface ReviewCheckItem {
  message: string
  tone: ReviewTone
}

export interface ReviewPreparationItem {
  message: string
  tone: ReviewTone
}

// Presentation helpers shared by the reviews page (list cards + approve dialog)
// and the extracted StudioReviewDetail component / right-sidebar panel, so the
// two surfaces render byte-identical copy (RFC Phase 5 step 5 — extract, don't
// duplicate).
export function useStudioReviewPresentation() {
  const { t, dateLocale } = useCmsI18n()

  function formatJson(value: StudioReviewRequest['preview']): string {
    return JSON.stringify(value, null, 2)
  }

  function countMessage(
    count: number,
    oneKey: string,
    otherKey: string,
    isLowerBound = false,
  ): string {
    return t(!isLowerBound && count === 1 ? oneKey : otherKey, {
      count: formatBoundedCount(count, isLowerBound),
    })
  }

  function statusLabel(status: string) {
    if (status === 'ready') return t('ginkoCms.studio.reviewsPage.reviewStatusReady')
    if (status === 'no_changes') return t('ginkoCms.studio.reviewsPage.reviewStatusNoChanges')
    if (status === 'blocked') return t('ginkoCms.studio.reviewsPage.reviewStatusBlocked')
    if (status === 'not_publishable')
      return t('ginkoCms.studio.reviewsPage.reviewStatusNotPublishable')
    return t('ginkoCms.studio.reviewsPage.reviewStatusUnknown')
  }

  function reviewSummaryText(summary: StudioReviewRequest['reviewSummary']): string {
    const parts = [statusLabel(summary.status)]
    if (summary.changeCount)
      parts.push(
        countMessage(
          summary.changeCount,
          'ginkoCms.studio.reviewsPage.previewChangesOne',
          'ginkoCms.studio.reviewsPage.previewChangesOther',
          summary.affectedPublicUrlsHasMore,
        ),
      )
    if (summary.blockerCount)
      parts.push(
        countMessage(
          summary.blockerCount,
          'ginkoCms.studio.reviewsPage.previewBlockersOne',
          'ginkoCms.studio.reviewsPage.previewBlockersOther',
        ),
      )
    if (summary.warningCount)
      parts.push(
        countMessage(
          summary.warningCount,
          'ginkoCms.studio.reviewsPage.previewWarningsOne',
          'ginkoCms.studio.reviewsPage.previewWarningsOther',
        ),
      )
    return parts.join(' · ')
  }

  function requestSourceLabel(request: ReviewRequest): string {
    return request.requestSource === 'agent'
      ? t('ginkoCms.studio.reviewsPage.requestSourceAgent')
      : t('ginkoCms.studio.reviewsPage.requestSourceHuman')
  }

  function sourcePanelTitle(request: ReviewRequest): string {
    return request.requestSource === 'agent'
      ? t('ginkoCms.studio.reviewsPage.aiPreparedTitle')
      : t('ginkoCms.studio.reviewsPage.humanPreparedTitle')
  }

  function sourceSummaryLabel(request: ReviewRequest): string {
    return request.requestSource === 'agent'
      ? t('ginkoCms.studio.reviewsPage.assistantSummary')
      : t('ginkoCms.studio.reviewsPage.requestSummary')
  }

  function preparationListTitle(request: ReviewRequest): string {
    return request.requestSource === 'agent'
      ? t('ginkoCms.studio.reviewsPage.assistantPreparedList')
      : t('ginkoCms.studio.reviewsPage.requestPreparedList')
  }

  function formatLocaleList(locales: string[]): string {
    return locales.length
      ? locales.join(', ').toUpperCase()
      : t('ginkoCms.studio.reviewsPage.noLanguagesSelected')
  }

  function approvalStatusText(request: ReviewRequest): string {
    if (request.isStale) {
      return request.staleReason || t('ginkoCms.studio.reviewsPage.staleCheck')
    }
    if (request.reviewSummary.blockerCount) {
      return t('ginkoCms.studio.reviewsPage.publishDecisionBlockers', {
        count: countMessage(
          request.reviewSummary.blockerCount,
          'ginkoCms.studio.reviewsPage.previewBlockersOne',
          'ginkoCms.studio.reviewsPage.previewBlockersOther',
        ),
      })
    }
    if (request.reviewSummary.warningCount) {
      return t('ginkoCms.studio.reviewsPage.publishDecisionWarnings', {
        count: countMessage(
          request.reviewSummary.warningCount,
          'ginkoCms.studio.reviewsPage.previewWarningsOne',
          'ginkoCms.studio.reviewsPage.previewWarningsOther',
        ),
      })
    }
    return t('ginkoCms.studio.reviewsPage.readyDecision')
  }

  function reviewPreparationItems(request: ReviewRequest): ReviewPreparationItem[] {
    const items: ReviewPreparationItem[] = []

    if (request.reviewSummary.changeCount) {
      items.push({
        message: countMessage(
          request.reviewSummary.changeCount,
          'ginkoCms.studio.reviewsPage.preparedChangesOne',
          'ginkoCms.studio.reviewsPage.preparedChangesOther',
          request.reviewSummary.affectedPublicUrlsHasMore,
        ),
        tone: 'neutral',
      })
    } else {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.preparedNoChanges'),
        tone: 'neutral',
      })
    }

    if (request.reviewSummary.affectedPublicUrlCount) {
      items.push({
        message: countMessage(
          request.reviewSummary.affectedPublicUrlCount,
          'ginkoCms.studio.reviewsPage.preparedPagesOne',
          'ginkoCms.studio.reviewsPage.preparedPagesOther',
          request.reviewSummary.affectedPublicUrlsHasMore,
        ),
        tone: 'neutral',
      })
    } else {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.preparedNoAffectedPages'),
        tone: 'neutral',
      })
    }

    if (request.isStale) {
      items.push({
        message: request.staleReason || t('ginkoCms.studio.reviewsPage.preparedStale'),
        tone: 'danger',
      })
    } else if (request.reviewSummary.blockerCount) {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.preparedBlocked', {
          count: countMessage(
            request.reviewSummary.blockerCount,
            'ginkoCms.studio.reviewsPage.previewBlockersOne',
            'ginkoCms.studio.reviewsPage.previewBlockersOther',
          ),
        }),
        tone: 'danger',
      })
    } else if (request.reviewSummary.warningCount) {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.preparedWarnings', {
          count: countMessage(
            request.reviewSummary.warningCount,
            'ginkoCms.studio.reviewsPage.previewWarningsOne',
            'ginkoCms.studio.reviewsPage.previewWarningsOther',
          ),
        }),
        tone: 'warning',
      })
    } else {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.preparedReady'),
        tone: 'success',
      })
    }

    return items
  }

  function reviewCheckItems(request: ReviewRequest): ReviewCheckItem[] {
    const items: ReviewCheckItem[] = []
    const hasConcerns =
      request.isStale || request.reviewSummary.blockerCount || request.reviewSummary.warningCount
    if (request.isStale) {
      items.push({
        message: request.staleReason || t('ginkoCms.studio.reviewsPage.staleCheck'),
        tone: 'danger',
      })
    }
    if (request.reviewSummary.blockerCount) {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.reviewCheckBlockers', {
          count: countMessage(
            request.reviewSummary.blockerCount,
            'ginkoCms.studio.reviewsPage.previewBlockersOne',
            'ginkoCms.studio.reviewsPage.previewBlockersOther',
          ),
        }),
        tone: 'danger',
      })
    }
    if (request.reviewSummary.warningCount) {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.reviewCheckWarnings', {
          count: countMessage(
            request.reviewSummary.warningCount,
            'ginkoCms.studio.reviewsPage.previewWarningsOne',
            'ginkoCms.studio.reviewsPage.previewWarningsOther',
          ),
        }),
        tone: 'warning',
      })
    }
    if (!hasConcerns) {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.noReviewConcerns'),
        tone: 'success',
      })
    }
    if (request.requestSource === 'agent') {
      items.push({
        message: t('ginkoCms.studio.reviewsPage.aiManualCheck'),
        tone: 'neutral',
      })
    }
    return items
  }

  function reviewCheckIconClass(item: ReviewCheckItem): string {
    if (item.tone === 'danger') return 'ginko:text-destructive'
    if (item.tone === 'warning') return 'ginko:text-warning-fg'
    if (item.tone === 'success') return 'ginko:text-success-fg'
    return 'ginko:text-muted-foreground'
  }

  return {
    t,
    dateLocale,
    formatJson,
    countMessage,
    statusLabel,
    reviewSummaryText,
    requestSourceLabel,
    sourcePanelTitle,
    sourceSummaryLabel,
    preparationListTitle,
    formatLocaleList,
    approvalStatusText,
    reviewPreparationItems,
    reviewCheckItems,
    reviewCheckIconClass,
  }
}
