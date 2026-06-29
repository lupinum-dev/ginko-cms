import {
  addMember as addMemberArgs,
  bootstrapCmsOwner as bootstrapCmsOwnerArgs,
  getMember as getMemberArgs,
  removeMember as removeMemberArgs,
  updateMemberRole as updateMemberRoleArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/members.js'
import {
  memberValidator,
  accessContextValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { getCmsAuth } from './auth-runtime'
import { cmsOperationPreviewValidator } from './operation-runtime'
import type { AnyDataModel, MutationBuilder, RegisteredMutation } from 'convex/server'
import { v, type Infer, type ObjectType } from 'convex/values'

import {
  createBridgeModule,
  readBridgeMutationComponent,
  type BridgeEntry,
  type BridgeModuleResult,
} from './create.js'

function componentArgs(args: unknown): never {
  return args as never
}

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const entries = [
  {
    exportName: 'getAccessContext',
    operation: 'query',
    component: 'getAccessContext',
    args: {},
    returns: accessContextValidator,
  },
  {
    exportName: 'listMembers',
    operation: 'query',
    component: 'listMembers',
    args: {},
    returns: v.array(memberValidator),
  },
  {
    exportName: 'getMember',
    operation: 'query',
    component: 'getMember',
    args: getMemberArgs.args,
    returns: v.union(v.null(), memberValidator),
  },
  {
    exportName: 'addMember',
    operation: 'mutation',
    component: 'addMember',
    args: addMemberArgs.args,
    returns: v.string(),
  },
  {
    exportName: 'updateMemberRole',
    operation: 'mutation',
    component: 'updateMemberRole',
    args: updateMemberRoleArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'removeMember',
    operation: 'mutation',
    component: 'removeMemberOperationExecute',
    args: confirmedArgs(removeMemberArgs.args),
    returns: v.null(),
  },
  {
    exportName: 'previewRemoveMemberOperation',
    operation: 'mutation',
    component: 'previewRemoveMemberOperation',
    args: removeMemberArgs.args,
    returns: cmsOperationPreviewValidator(),
  },
] as const satisfies readonly BridgeEntry[]

export const bridgeExportNames = [
  ...entries.map((entry) => entry.exportName),
  'bootstrapCmsOwner',
] as const

export function createMembersBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
  mutation: MutationBuilder<AnyDataModel, 'public'>
}): BridgeModuleResult<typeof entries> & {
  bootstrapCmsOwner: RegisteredMutation<
    'public',
    ObjectType<typeof bootstrapCmsOwnerArgs.args>,
    Promise<Infer<typeof memberValidator>>
  >
} {
  return {
    ...createBridgeModule(options.component, options.components, entries),
    bootstrapCmsOwner: options.mutation({
      args: bootstrapCmsOwnerArgs.args,
      returns: memberValidator,
      handler: async (ctx, args) => {
        const auth = await getCmsAuth(ctx as never)
        const payload = componentArgs({
          ...args,
          displayName: auth?.displayName,
          email: auth?.email,
          configuredOwnerEmail: process?.env?.GINKO_FIRST_OWNER_EMAIL,
        })
        const component = readBridgeMutationComponent(options.components, 'bootstrapCmsOwner')
        return await ctx.runMutation(component, payload)
      },
    }),
  }
}
