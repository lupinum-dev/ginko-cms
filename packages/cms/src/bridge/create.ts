import {
  callComponentBridgeRegistrar,
  type ComponentBridgeComponent,
} from '@lupinum/trellis-bridge/component'
import type {
  FunctionReference,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server'
import type { GenericValidator, Infer, ObjectType, PropertyValidators } from 'convex/values'

type QueryBridgeEntry<
  TReturns extends GenericValidator | undefined = GenericValidator | undefined,
> = {
  exportName: string
  operation: 'query' | 'internalQuery'
  component: string
  args: PropertyValidators
  returns?: TReturns
  forwardIdentity?: boolean
}

type MutationBridgeEntry<
  TReturns extends GenericValidator | undefined = GenericValidator | undefined,
> = {
  exportName: string
  operation: 'mutation' | 'internalMutation'
  component: string
  args: PropertyValidators
  returns?: TReturns
  forwardIdentity?: boolean
}

type ActionBridgeEntry<
  TReturns extends GenericValidator | undefined = GenericValidator | undefined,
> = {
  exportName: string
  operation: 'action' | 'internalAction'
  component: string
  args: PropertyValidators
  returns?: TReturns
  forwardIdentity?: boolean
}

export type BridgeEntry = QueryBridgeEntry | MutationBridgeEntry | ActionBridgeEntry

type BridgeEntryReturn<Entry extends BridgeEntry> = Entry extends {
  returns: infer TReturns extends GenericValidator
}
  ? Infer<TReturns>
  : unknown

type BridgeModuleExport =
  | RegisteredQuery<'public' | 'internal', Record<string, unknown>, Promise<unknown>>
  | RegisteredMutation<'public' | 'internal', Record<string, unknown>, Promise<unknown>>
  | RegisteredAction<'public' | 'internal', Record<string, unknown>, Promise<unknown>>

type BridgeEntryVisibility<Entry extends BridgeEntry> = Entry['operation'] extends
  | 'query'
  | 'mutation'
  | 'action'
  ? 'public'
  : 'internal'

export type BridgeModuleResult<TEntries extends readonly BridgeEntry[]> = {
  [Entry in TEntries[number] as Entry['exportName']]: Entry extends QueryBridgeEntry
    ? RegisteredQuery<
        BridgeEntryVisibility<Entry>,
        ObjectType<Entry['args']>,
        Promise<BridgeEntryReturn<Entry>>
      >
    : Entry extends MutationBridgeEntry
      ? RegisteredMutation<
          BridgeEntryVisibility<Entry>,
          ObjectType<Entry['args']>,
          Promise<BridgeEntryReturn<Entry>>
        >
      : Entry extends ActionBridgeEntry
        ? RegisteredAction<
            BridgeEntryVisibility<Entry>,
            ObjectType<Entry['args']>,
            Promise<BridgeEntryReturn<Entry>>
          >
        : BridgeModuleExport
}

type QueryRef = FunctionReference<'query', 'public' | 'internal'>
type MutationRef = FunctionReference<'mutation', 'public' | 'internal'>
type ActionRef = FunctionReference<'action', 'public' | 'internal'>

function readComponent(components: Record<string, unknown>, path: string): unknown {
  let current: unknown = components
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Missing component bridge function: ${path}`)
    }
    current = (current as Record<string, unknown>)[part]
    if (current === undefined || current === null) {
      throw new Error(`Missing component bridge function: ${path}`)
    }
  }
  return current
}

export function readBridgeQueryComponent(
  components: Record<string, unknown>,
  path: string,
): QueryRef {
  return readComponent(components, path) as QueryRef
}

export function readBridgeMutationComponent(
  components: Record<string, unknown>,
  path: string,
): MutationRef {
  return readComponent(components, path) as MutationRef
}

export function readBridgeActionComponent(
  components: Record<string, unknown>,
  path: string,
): ActionRef {
  return readComponent(components, path) as ActionRef
}

export function createBridgeModule<TEntries extends readonly BridgeEntry[]>(
  bridge: ComponentBridgeComponent,
  components: Record<string, unknown>,
  entries: TEntries,
): BridgeModuleResult<TEntries> {
  const result: Record<string, BridgeModuleExport> = {}
  for (const entry of entries) {
    const functionRef = bridgeEntryFunctionRef(entry)
    switch (entry.operation) {
      case 'query':
        result[entry.exportName] = callComponentBridgeRegistrar(bridge.query, {
          args: entry.args,
          returns: entry.returns,
          component: readBridgeQueryComponent(components, entry.component),
          functionRef,
          forwardIdentity: entry.forwardIdentity ?? false,
        })
        break
      case 'internalQuery':
        result[entry.exportName] = callComponentBridgeRegistrar(bridge.internalQuery, {
          args: entry.args,
          returns: entry.returns,
          component: readBridgeQueryComponent(components, entry.component),
          functionRef,
          forwardIdentity: entry.forwardIdentity ?? false,
        })
        break
      case 'mutation':
        result[entry.exportName] = callComponentBridgeRegistrar(bridge.mutation, {
          args: entry.args,
          returns: entry.returns,
          component: readBridgeMutationComponent(components, entry.component),
          functionRef,
          forwardIdentity: entry.forwardIdentity ?? false,
        })
        break
      case 'action':
        if (!bridge.action) {
          throw new Error(`Bridge module entry ${entry.exportName} requires action support.`)
        }
        result[entry.exportName] = callComponentBridgeRegistrar(bridge.action, {
          args: entry.args,
          returns: entry.returns,
          component: readBridgeActionComponent(components, entry.component),
          functionRef,
          forwardIdentity: entry.forwardIdentity ?? false,
        })
        break
      case 'internalMutation':
        result[entry.exportName] = callComponentBridgeRegistrar(bridge.internalMutation, {
          args: entry.args,
          returns: entry.returns,
          component: readBridgeMutationComponent(components, entry.component),
          functionRef,
          forwardIdentity: entry.forwardIdentity ?? false,
        })
        break
      case 'internalAction':
        if (!bridge.internalAction) {
          throw new Error(
            `Bridge module entry ${entry.exportName} requires internalAction support.`,
          )
        }
        result[entry.exportName] = callComponentBridgeRegistrar(bridge.internalAction, {
          args: entry.args,
          returns: entry.returns,
          component: readBridgeActionComponent(components, entry.component),
          functionRef,
          forwardIdentity: entry.forwardIdentity ?? false,
        })
        break
    }
  }
  return result as BridgeModuleResult<TEntries>
}

export function bridgeEntryFunctionRef(entry: BridgeEntry): string {
  const parts = entry.component.split('.')
  const exportName = parts.pop() ?? entry.component
  const modulePath = parts.join('/')
  return [modulePath, exportName].filter(Boolean).join(':')
}
