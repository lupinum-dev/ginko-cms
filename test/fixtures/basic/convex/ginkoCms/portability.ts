import {
  abortExportRun as abortExportRunArgs,
  abortImport as abortImportArgs,
  appendImportPlanAssets as appendImportPlanAssetsArgs,
  appendImportPlanItems as appendImportPlanItemsArgs,
  applyImportItem as applyImportItemArgs,
  beginImportApply as beginImportApplyArgs,
  beginPortableAssetUpload as beginPortableAssetUploadArgs,
  beginImportVerification as beginImportVerificationArgs,
  beginPortableAssetDownload as beginPortableAssetDownloadArgs,
  createImportPlan as createImportPlanArgs,
  captureExportPage as captureExportPageArgs,
  claimPortableAssetDownload as claimPortableAssetDownloadArgs,
  completeExportRun as completeExportRunArgs,
  createExportRun as createExportRunArgs,
  expireExportRun as expireExportRunArgs,
  expireImport as expireImportArgs,
  finalizeImport as finalizeImportArgs,
  inspectPortableAssets as inspectPortableAssetsArgs,
  inspectPortableDrafts as inspectPortableDraftsArgs,
  issuePortableAssetUploadUrl as issuePortableAssetUploadUrlArgs,
  recordPortableAssetUpload as recordPortableAssetUploadArgs,
  readExportAssets as readExportAssetsArgs,
  readExportDocuments as readExportDocumentsArgs,
  sealExportRun as sealExportRunArgs,
  sealImportPlan as sealImportPlanArgs,
  verifyPortableAssetUpload as verifyPortableAssetUploadArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'

import { components } from '../_generated/api'
import { action, mutation, query } from '../_generated/server'

export const inspectPortableDrafts = query({
  args: inspectPortableDraftsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.inspectPortableDrafts, args as never),
})

export const inspectPortableAssets = query({
  args: inspectPortableAssetsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.inspectPortableAssets, args as never),
})

export const createImportPlan = mutation({
  args: createImportPlanArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.createImportPlan, args as never),
})

export const appendImportPlanItems = mutation({
  args: appendImportPlanItemsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.appendImportPlanItems, args as never),
})

export const appendImportPlanAssets = mutation({
  args: appendImportPlanAssetsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.appendImportPlanAssets, args as never),
})

export const sealImportPlan = action({
  args: sealImportPlanArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.portability.sealImportPlan, args as never),
})

export const beginPortableAssetUpload = mutation({
  args: beginPortableAssetUploadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.beginPortableAssetUpload, args as never),
})

export const issuePortableAssetUploadUrl = mutation({
  args: issuePortableAssetUploadUrlArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.issuePortableAssetUploadUrl,
      args as never,
    ),
})

export const recordPortableAssetUpload = mutation({
  args: recordPortableAssetUploadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.recordPortableAssetUpload, args as never),
})

export const verifyPortableAssetUpload = action({
  args: verifyPortableAssetUploadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.portability.verifyPortableAssetUpload, args as never),
})

export const beginImportApply = mutation({
  args: beginImportApplyArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.beginImportApply, args as never),
})

export const applyImportItem = mutation({
  args: applyImportItemArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.applyImportItem, args as never),
})

export const beginImportVerification = mutation({
  args: beginImportVerificationArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.beginImportVerification, args as never),
})

export const finalizeImport = mutation({
  args: finalizeImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.finalizeImport, args as never),
})

export const abortImport = mutation({
  args: abortImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.abortImport, args as never),
})

export const expireImport = mutation({
  args: expireImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.expireImport, args as never),
})

export const createExportRun = mutation({
  args: createExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.createExportRun, args as never),
})

export const captureExportPage = mutation({
  args: captureExportPageArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.captureExportPage, args as never),
})

export const sealExportRun = mutation({
  args: sealExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.sealExportRun, args as never),
})

export const readExportDocuments = query({
  args: readExportDocumentsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.readExportDocuments, args as never),
})

export const readExportAssets = query({
  args: readExportAssetsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.readExportAssets, args as never),
})

export const beginPortableAssetDownload = mutation({
  args: beginPortableAssetDownloadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.beginPortableAssetDownload,
      args as never,
    ),
})

export const claimPortableAssetDownload = mutation({
  args: claimPortableAssetDownloadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.claimPortableAssetDownload,
      args as never,
    ),
})

export const completeExportRun = mutation({
  args: completeExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.completeExportRun, args as never),
})

export const abortExportRun = mutation({
  args: abortExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.abortExportRun, args as never),
})

export const expireExportRun = mutation({
  args: expireExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.expireExportRun, args as never),
})
