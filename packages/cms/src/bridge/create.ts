import type {
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
        : never
}

export function createBridgeModule<TEntries extends readonly BridgeEntry[]>(
  _entries: TEntries,
): BridgeModuleResult<TEntries> {
  throw new Error('TODO(trellis-cutover): restore direct-template bridge module in Phase 7')
}

