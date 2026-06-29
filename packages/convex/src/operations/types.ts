import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

export type CmsOperationId =
  | 'assets.move'
  | 'assets.delete'
  | 'assets.purge'
  | 'backup.deleteArtifact'
  | 'entries.archive'
  | 'entries.create'
  | 'entries.delete'
  | 'entries.publish'
  | 'entries.rollback'
  | 'entries.unarchive'
  | 'entries.unpublish'
  | 'entries.drafts.revertToPublished'
  | 'entries.drafts.save'
  | 'members.remove'
  | 'revalidation.retryJob'
  | 'siteData.deleteBlock'

export type CmsOperationContext =
  | GenericQueryCtx<any>
  | GenericMutationCtx<any>
  | GenericActionCtx<any>

export type CmsOperationPreview<Details = unknown> = {
  operationId: CmsOperationId
  destructive: boolean
  details?: Details
  blockers?: string[]
}

export type CmsOperationDescriptor<Args = unknown, Preview = unknown, Result = unknown> = {
  id: CmsOperationId
  destructive: boolean
  preview: (ctx: CmsOperationContext, args: Args) => Promise<CmsOperationPreview<Preview>>
  execute: (ctx: CmsOperationContext, args: Args) => Promise<Result>
}

export type CmsOperationRegistry = Partial<
  Record<CmsOperationId, CmsOperationDescriptor<unknown, unknown, unknown>>
>

