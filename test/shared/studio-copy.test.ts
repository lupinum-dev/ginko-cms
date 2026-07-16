import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import de from '../../packages/cms/src/public/locales/de'
import en from '../../packages/cms/src/public/locales/en'
import {
  readinessActionKinds,
  readinessIssueCodes,
  readinessStates,
} from '../../packages/contract/src/readiness'

type FlatMessages = Record<string, string>

function flattenMessages(value: unknown, prefix = ''): FlatMessages {
  if (typeof value === 'string') return { [prefix]: value }
  if (!value || typeof value !== 'object') return {}

  return Object.entries(value as Record<string, unknown>).reduce<FlatMessages>(
    (messages, [key, child]) => ({
      ...messages,
      ...flattenMessages(child, prefix ? `${prefix}.${key}` : key),
    }),
    {},
  )
}

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const primaryStudioFiles = [
  'packages/cms/studio-app/src/components/studio/editor/StudioEntryStatusRail.vue',
  'packages/cms/studio-app/src/components/studio/editor/StudioEntryTrackCard.vue',
  'packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue',
  'packages/cms/studio-app/src/components/studio/editor/StudioPublishOutcomeCard.vue',
  'packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue',
  'packages/cms/studio-app/src/components/studio/editor/StudioTranslationReadinessCard.vue',
  'packages/cms/studio-app/src/components/studio/editor/StudioSharedFieldsPanel.vue',
  'packages/cms/studio-app/src/components/studio/StudioAssetBrowser.vue',
  // W8 decomposition: the browser's extracted surfaces keep the same banned-copy
  // coverage the monolith had.
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetBulkBar.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetGridView.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetInfoList.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetListView.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetManageDrawer.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetMetadataFields.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetMobileDetailsSheet.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetNav.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetPickDetails.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetToolbar.vue',
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetTrashDialog.vue',
  'packages/cms/studio-app/src/components/studio/StudioAssetMetadataDialog.vue',
  'packages/cms/studio-app/src/pages/[collection]/index.vue',
  'packages/cms/studio-app/src/pages/[collection]/new.vue',
  'packages/cms/studio-app/src/pages/reviews.vue',
]

const bannedPrimaryPhrases = [
  'Current locale',
  'Public URL',
  'Website URLs',
  'Agent sessions',
  'MCP token',
  'Language readiness',
  'Read-only readiness preview',
  'Published website content',
  'confirmation token',
  'preview hash',
  'draft version',
  'public-output refresh',
  'affected locales',
]

describe('Studio copy guardrails', () => {
  it('keeps English and German locale dictionaries in parity', () => {
    expect(Object.keys(flattenMessages(de)).sort()).toEqual(Object.keys(flattenMessages(en)).sort())
  })

  it('owns every readiness label in English and German locale copy', () => {
    const enFlat = flattenMessages(en)
    const deFlat = flattenMessages(de)

    for (const state of readinessStates) {
      const key = `ginkoCms.studio.workflow.states.${state}`
      expect(enFlat[key]).toBeTruthy()
      expect(deFlat[key]).toBeTruthy()
      expect(enFlat[key]).not.toBe(state)
      expect(deFlat[key]).not.toBe(state)
    }

    for (const action of readinessActionKinds) {
      const key = `ginkoCms.studio.workflow.actions.${action}`
      expect(enFlat[key]).toBeTruthy()
      expect(deFlat[key]).toBeTruthy()
      expect(enFlat[key]).not.toBe(action)
      expect(deFlat[key]).not.toBe(action)
    }

    for (const issue of readinessIssueCodes) {
      const key = `ginkoCms.studio.workflow.issues.${issue}`
      expect(enFlat[key]).toBeTruthy()
      expect(deFlat[key]).toBeTruthy()
      expect(enFlat[key]).not.toBe(issue)
      expect(deFlat[key]).not.toBe(issue)
    }
  })

  it('uses the agreed marketer vocabulary in locale copy', () => {
    expect(en.ginkoCms.common.locale).toBe('Language')
    expect(en.ginkoCms.studio.collectionListPage.localesColumn).toBe('Languages')
    expect(en.ginkoCms.studio.collectionEditor.publishDialogDescription).toBe(
      'Review what will change on the website before this goes live.',
    )
    expect(en.ginkoCms.studio.collectionEditor.publishMessageLabel).toBe('Publish note')
    expect(en.ginkoCms.studio.reviewsPage.approveButton).toBe('Approve and publish')
    expect(en.ginkoCms.studio.reviewsPage.affectedLocales).toBe('Languages')
    expect(en.ginkoCms.studio.agentsPage.title).toBe('AI work sessions')
    expect(en.ginkoCms.studio.settingsPage.mcpTokenReady).toBe('Your MCP access key is ready')
    expect(en.ginkoCms.studio.assetPicker.saveMetadataError).toBe('Failed to save details.')
  })

  it('uses matching German product terms', () => {
    expect(de.ginkoCms.common.locale).toBe('Sprache')
    expect(de.ginkoCms.studio.collectionListPage.localesColumn).toBe('Sprachen')
    expect(de.ginkoCms.studio.collectionEditor.publishMessageLabel).toBe('Veröffentlichungsnotiz')
    expect(de.ginkoCms.studio.reviewsPage.affectedLocales).toBe('Betroffene Sprachen')
    expect(de.ginkoCms.studio.reviewsPage.approveButton).toBe('Freigeben und veröffentlichen')
    expect(de.ginkoCms.studio.agentsPage.title).toBe('KI-Arbeitssitzungen')
    expect(de.ginkoCms.studio.settingsPage.mcpTokenReady).toBe(
      'Dein MCP-Zugriffsschlüssel ist bereit',
    )
  })

  it('keeps banned backend terms out of primary Studio UI copy', () => {
    const violations = primaryStudioFiles.flatMap((path) => {
      const source = readWorkspaceFile(path)
      return bannedPrimaryPhrases
        .filter((phrase) => source.includes(phrase))
        .map((phrase) => `${path}: ${phrase}`)
    })

    expect(violations).toEqual([])
    // The list header is fully keyed now (design review F1a): the status
    // column uses the shared statusColumn locale key.
    expect(readWorkspaceFile('packages/cms/studio-app/src/pages/[collection]/index.vue')).toContain(
      'collectionListPage.statusColumn',
    )
  })

  it('does not derive user-facing readiness copy from raw backend codes', () => {
    const workflowSource = readWorkspaceFile('packages/cms/studio-app/src/lib/publicWorkflow.ts')
    const workflowTypesSource = readWorkspaceFile(
      'packages/cms/studio-app/src/components/studio/editor/studioWorkflowTypes.ts',
    )

    expect(workflowSource).not.toContain('READINESS_ACTION_LABELS')
    expect(workflowSource).not.toContain('READINESS_ISSUE_LABELS')
    expect(workflowSource).not.toContain("code.replaceAll('_', ' ')")
    expect(workflowTypesSource).not.toContain("code.replaceAll('_', ' ')")
  })

  it('keeps MCP explicit in setup copy without making it everyday workflow language', () => {
    const setupCopy = readWorkspaceFile(
      'packages/cms/studio-app/src/components/studio/settings/StudioSettingsMcpConnectionsSection.vue',
    )
    const agentsCopy = readWorkspaceFile('packages/cms/studio-app/src/pages/agents.vue')

    expect(setupCopy).toContain('MCP connections for AI tools')
    expect(setupCopy).toContain('ginkoCms.studio.settingsPage.mcpTokenReady')
    expect(setupCopy).toContain('Copy access key')
    expect(agentsCopy).toContain('ginkoCms.studio.agentsPage.title')
    expect(agentsCopy).not.toContain('Agent sessions')
  })
})
