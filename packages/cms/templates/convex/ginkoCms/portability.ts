import {
  abortExportRun as abortExportRunArgs,
  abortImport as abortImportArgs,
  appendImportPlanAssets as appendImportPlanAssetsArgs,
  appendImportPlanItems as appendImportPlanItemsArgs,
  applyImportBatch as applyImportBatchArgs,
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
import { cmsCallerFromActionAuthIdentity } from '@lupinum/ginko-cms-contract/shared/caller.js'

import { components } from '../_generated/api'
import { action, mutation, query } from '../_generated/server'
import { bindExpectedCmsContract } from './contractBinding.js'

export const inspectPortableDrafts = query({
  args: inspectPortableDraftsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.inspectPortableDrafts, args),
})

export const inspectPortableAssets = query({
  args: inspectPortableAssetsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.inspectPortableAssets, args),
})

export const createImportPlan = mutation({
  args: createImportPlanArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.createImportPlan,
      bindExpectedCmsContract(args),
    ),
})

export const appendImportPlanItems = mutation({
  args: appendImportPlanItemsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.appendImportPlanItems,
      bindExpectedCmsContract(args),
    ),
})

export const appendImportPlanAssets = mutation({
  args: appendImportPlanAssetsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.appendImportPlanAssets,
      bindExpectedCmsContract(args),
    ),
})

export const sealImportPlan = action({
  args: sealImportPlanArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.portability.sealImportPlan,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const beginPortableAssetUpload = mutation({
  args: beginPortableAssetUploadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.beginPortableAssetUpload,
      bindExpectedCmsContract(args),
    ),
})

export const issuePortableAssetUploadUrl = mutation({
  args: issuePortableAssetUploadUrlArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.issuePortableAssetUploadUrl,
      bindExpectedCmsContract(args),
    ),
})

export const recordPortableAssetUpload = mutation({
  args: recordPortableAssetUploadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.recordPortableAssetUpload,
      bindExpectedCmsContract(args),
    ),
})

export const verifyPortableAssetUpload = action({
  args: verifyPortableAssetUploadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.portability.verifyPortableAssetUpload,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const beginImportApply = mutation({
  args: beginImportApplyArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.beginImportApply,
      bindExpectedCmsContract(args),
    ),
})

export const applyImportBatch = action({
  args: applyImportBatchArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.portability.applyImportBatch,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const beginImportVerification = mutation({
  args: beginImportVerificationArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.beginImportVerification,
      bindExpectedCmsContract(args),
    ),
})

export const finalizeImport = mutation({
  args: finalizeImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.finalizeImport,
      bindExpectedCmsContract(args),
    ),
})

export const abortImport = mutation({
  args: abortImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.abortImport,
      bindExpectedCmsContract(args),
    ),
})

export const expireImport = mutation({
  args: expireImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.expireImport,
      bindExpectedCmsContract(args),
    ),
})

export const createExportRun = action({
  args: createExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.portability.createExportRun,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const captureExportPage = mutation({
  args: captureExportPageArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.captureExportPage,
      bindExpectedCmsContract(args),
    ),
})

export const sealExportRun = mutation({
  args: sealExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.sealExportRun,
      bindExpectedCmsContract(args),
    ),
})

export const readExportDocuments = query({
  args: readExportDocumentsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.readExportDocuments, args),
})

export const readExportAssets = query({
  args: readExportAssetsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.readExportAssets, args),
})

export const beginPortableAssetDownload = mutation({
  args: beginPortableAssetDownloadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.beginPortableAssetDownload,
      bindExpectedCmsContract(args),
    ),
})

export const claimPortableAssetDownload = mutation({
  args: claimPortableAssetDownloadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.claimPortableAssetDownload,
      bindExpectedCmsContract(args),
    ),
})

export const completeExportRun = mutation({
  args: completeExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.completeExportRun,
      bindExpectedCmsContract(args),
    ),
})

export const abortExportRun = mutation({
  args: abortExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.abortExportRun,
      bindExpectedCmsContract(args),
    ),
})

export const expireExportRun = mutation({
  args: expireExportRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.portability.expireExportRun,
      bindExpectedCmsContract(args),
    ),
})
