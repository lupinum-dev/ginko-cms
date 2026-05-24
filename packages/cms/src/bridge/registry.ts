import { entries as assetBridgeEntries } from './assets.js'
import { entries as backupBridgeEntries } from './backup.js'
import { entries as collectionBridgeEntries } from './collections.js'
import { entries as diagnosticsBridgeEntries } from './diagnostics.js'
import { entries as editorBridgeEntries } from './editor.js'
import { entries as importBridgeEntries } from './imports.js'
import { bridgeExportNames as mcpBridgeExportNames, entries as mcpBridgeEntries } from './mcp.js'
import { entries as mcpKeyBridgeEntries } from './mcpKeys.js'
import {
  bridgeExportNames as memberBridgeExportNames,
  entries as memberBridgeEntries,
} from './members.js'
import { entries as migrationBridgeEntries } from './migrations.js'
import { entries as publicBridgeEntries } from './public.js'
import { entries as revalidationBridgeEntries } from './revalidation.js'
import { entries as settingsBridgeEntries } from './settings.js'
import { entries as siteDataBridgeEntries } from './siteData.js'

export interface BridgeRegistryModule {
  relativePath: string
  factoryName: string
  factoryPath: string
  componentPath?: string
  entries: readonly { exportName: string }[]
  exportNames?: readonly string[]
  imports?: Array<{ named: string[]; from: string }>
  factoryArgs?: Record<string, string>
}

const bridgeFactoryPath = '@lupinum/ginko-cms/bridge'

const generatedGinkoImports = [
  { named: ['components'], from: '../_generated/api' },
  { named: ['component'], from: './_caller' },
]

export const bridgeModuleRegistry: readonly BridgeRegistryModule[] = [
  {
    relativePath: 'convex/ginkoCms/assets.ts',
    factoryName: 'createAssetsBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.assets',
    entries: assetBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/backup.ts',
    factoryName: 'createBackupBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.backup',
    entries: backupBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/collections.ts',
    factoryName: 'createCollectionContractsBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.collections',
    entries: collectionBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/diagnostics.ts',
    factoryName: 'createDiagnosticsBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.diagnostics',
    entries: diagnosticsBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/imports.ts',
    factoryName: 'createImportsBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.imports',
    entries: importBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/editor.ts',
    factoryName: 'createEditorBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.editor',
    entries: editorBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/mcpKeys.ts',
    factoryName: 'createMcpKeysBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.mcpKeys',
    entries: mcpKeyBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/members.ts',
    factoryName: 'createMembersBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.members',
    entries: memberBridgeEntries,
    exportNames: memberBridgeExportNames,
    imports: [
      { named: ['components'], from: '../_generated/api' },
      { named: ['mutation'], from: '../_generated/server' },
      { named: ['component'], from: './_caller' },
    ],
    factoryArgs: {
      component: 'component',
      components: 'components.ginkoCms.members',
      mutation: 'mutation',
    },
  },
  {
    relativePath: 'convex/ginkoCms/migrations.ts',
    factoryName: 'createMigrationsBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.migrations',
    entries: migrationBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/public.ts',
    factoryName: 'createPublicBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.public',
    entries: publicBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/revalidation.ts',
    factoryName: 'createRevalidationBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.revalidation',
    entries: revalidationBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/settings.ts',
    factoryName: 'createSettingsBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.settings',
    entries: settingsBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCms/siteData.ts',
    factoryName: 'createSiteDataBridge',
    factoryPath: bridgeFactoryPath,
    componentPath: 'ginkoCms.siteData',
    entries: siteDataBridgeEntries,
  },
  {
    relativePath: 'convex/ginkoCmsMcp.ts',
    factoryName: 'createMcpBridge',
    factoryPath: bridgeFactoryPath,
    entries: mcpBridgeEntries,
    exportNames: mcpBridgeExportNames,
    imports: [
      { named: ['components'], from: './_generated/api' },
      { named: ['internalMutation'], from: './_generated/server' },
      { named: ['component'], from: './ginkoCms/_caller' },
    ],
    factoryArgs: {
      component: 'component',
      components: 'components.ginkoCms',
      internalMutation: 'internalMutation',
    },
  },
]

export const defaultBridgeImports = generatedGinkoImports
