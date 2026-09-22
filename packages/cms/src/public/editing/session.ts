import type { JsonObject, JsonValue, NodeKind } from '@lupinum/ginko-cms-contract/shared/types.js'
import { isEqualJsonValue } from '@lupinum/ginko-cms-contract/shared/utils.js'

/** The canonical draft shape shared by Studio and website editing. */
export interface DraftPatch {
  shared?: {
    parentEntryId?: string | null
    orderRank?: string | null
    slug?: string | null
    shared?: JsonObject
    nodeKind?: NodeKind
  }
  locales?: Record<string, { slug?: string | null; values?: JsonObject; bodyMdc?: string | null }>
}
export interface DraftSnapshot {
  localeDraftIds: Record<string, string>
  version: number
  patch: DraftPatch
}
export interface DraftSaveRequest {
  entryId: string
  expectedDraftVersion: number
  patch: DraftPatch
  concurrency: { requestId: string; base: DraftPatch; localeDraftIds: Record<string, string> }
}
export interface DraftConflict {
  path: string[]
  before: JsonValue | undefined
  mine: JsonValue | undefined
  shared: JsonValue | undefined
}
export interface DraftSessionOptions {
  entryId: string
  save: (request: DraftSaveRequest) => Promise<{ draftVersion: number }>
  canEdit: () => boolean
  flushEditors?: () => Promise<boolean>
  hasPendingEditors?: () => boolean
  requestId?: () => string
  delay?: number
}

type Slots = Record<string, JsonValue>
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const equal = (left: JsonValue | undefined, right: JsonValue | undefined) =>
  left === undefined || right === undefined ? left === right : isEqualJsonValue(left, right)

// Values are atomic at a content field boundary. Arrays and rich text are not
// merged by position: doing so could silently combine two incompatible edits.
function slots(patch: DraftPatch): Slots {
  const result: Slots = {}
  const put = (path: string[], value: JsonValue | undefined) => {
    if (value !== undefined) result[JSON.stringify(path)] = clone(value)
  }
  for (const [key, value] of Object.entries(patch.shared ?? {})) {
    if (key === 'shared' && value && typeof value === 'object') {
      for (const [field, data] of Object.entries(value)) put(['shared', 'shared', field], data)
    } else put(['shared', key], value)
  }
  for (const [locale, state] of Object.entries(patch.locales ?? {})) {
    for (const [key, value] of Object.entries(state)) {
      if (key === 'values' && value && typeof value === 'object') {
        for (const [field, data] of Object.entries(value))
          put(['locales', locale, 'values', field], data)
      } else put(['locales', locale, key], value)
    }
  }
  return result
}

function patchFromSlots(values: Slots, shape: DraftPatch): DraftPatch {
  // Preserve empty maps so deleting the last field has explicit semantics.
  const result: DraftPatch = {}
  if (shape.shared) result.shared = { ...(shape.shared.shared ? { shared: {} } : {}) }
  if (shape.locales) {
    result.locales = Object.fromEntries(
      Object.entries(shape.locales).map(([locale, state]) => [
        locale,
        { ...(state.values ? { values: {} } : {}) },
      ]),
    )
  }
  for (const [key, value] of Object.entries(values)) {
    const path: string[] = JSON.parse(key)
    let target: Record<string, unknown> = result as Record<string, unknown>
    for (const segment of path.slice(0, -1)) {
      if (!Object.hasOwn(target, segment)) {
        Object.defineProperty(target, segment, {
          value: {},
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      target = target[segment] as Record<string, unknown>
    }
    // Field names are data, including keys that shadow Object.prototype.
    Object.defineProperty(target, path.at(-1)!, {
      value: clone(value),
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return result
}

function copySlot(target: Slots, source: Slots, key: string) {
  if (Object.hasOwn(source, key)) target[key] = clone(source[key]!)
  else Reflect.deleteProperty(target, key)
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  let data: unknown = 'data' in error ? error.data : undefined
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      /* Unstructured transport errors remain uncertain. */
    }
  }
  if (data && typeof data === 'object' && 'code' in data && typeof data.code === 'string')
    return data.code
  const message = error instanceof Error ? error.message : ''
  return (
    /ENTRY_(?:CONCURRENT_EDIT|DRAFT_VERSION_CONFLICT|DRAFT_FIELD_CONFLICT)/.exec(message)?.[0] ?? ''
  )
}

/** One acknowledged shared draft, with local unsaved intent kept separately. */
export class EntryDraftSession {
  version = 0
  initialized = false
  saving = false
  error: unknown = null
  conflicts: DraftConflict[] = []
  lastSaved: number | null = null
  private localeDraftIds: Record<string, string> = {}
  private base: Slots = {}
  private local: Slots = {}
  private shape: DraftPatch = {}
  private deferred: DraftSnapshot | null = null
  private pending: DraftSaveRequest | null = null
  private running: Promise<boolean> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(private readonly options: DraftSessionOptions) {}

  get patch(): DraftPatch {
    return patchFromSlots(this.local, this.shape)
  }
  get dirty(): boolean {
    return [...new Set([...Object.keys(this.base), ...Object.keys(this.local)])].some(
      (key) => !equal(this.base[key], this.local[key]),
    )
  }
  get hasUnconfirmedSave(): boolean {
    return this.pending !== null && !this.saving
  }
  get hasPendingWork(): boolean {
    return (
      this.dirty ||
      this.conflicts.length > 0 ||
      this.saving ||
      this.pending !== null ||
      !!this.options.hasPendingEditors?.()
    )
  }
  get state(): 'saved' | 'dirty' | 'saving' | 'conflict' | 'error' {
    if (this.conflicts.length) return 'conflict'
    if (this.error) return 'error'
    if (this.saving) return 'saving'
    return this.hasPendingWork ? 'dirty' : 'saved'
  }

  receive(snapshot: DraftSnapshot) {
    if (this.disposed || snapshot.version < this.version) return
    if (this.saving || this.pending || this.options.hasPendingEditors?.()) {
      if (!this.deferred || snapshot.version >= this.deferred.version)
        this.deferred = clone(snapshot)
      return
    }
    const remote = slots(snapshot.patch)
    if (!this.initialized) {
      this.base = clone(remote)
      this.local = clone(remote)
      this.initialized = true
    } else {
      const conflicts: DraftConflict[] = []
      for (const key of new Set([
        ...Object.keys(this.base),
        ...Object.keys(this.local),
        ...Object.keys(remote),
      ])) {
        const existingConflict = this.conflicts.find(
          (conflict) => JSON.stringify(conflict.path) === key,
        )
        const path: string[] = JSON.parse(key)
        const replacedLocale =
          path[0] === 'locales' &&
          this.localeDraftIds[path[1]!] !== snapshot.localeDraftIds[path[1]!]
        if (
          !existingConflict &&
          (equal(this.local[key], this.base[key]) ||
            (!replacedLocale && equal(this.local[key], remote[key])))
        ) {
          copySlot(this.local, remote, key)
        } else if (replacedLocale || !equal(remote[key], this.base[key]) || existingConflict) {
          conflicts.push({
            path: JSON.parse(key),
            before: existingConflict ? existingConflict.before : this.base[key],
            mine: this.local[key],
            shared: remote[key],
          })
        }
      }
      this.conflicts = conflicts
      this.base = clone(remote)
    }
    this.localeDraftIds = clone(snapshot.localeDraftIds)
    this.shape = clone(snapshot.patch)
    this.version = snapshot.version
  }

  /** Replace the complete local draft. Start from `session.patch`; omitted fields are deletions. */
  edit(patch: DraftPatch) {
    if (!this.options.canEdit() || this.disposed || !this.initialized) return
    this.local = slots(patch)
    this.shape = clone(patch)
    // A conflict remains explicit until the person chooses a value.
    this.conflicts = this.conflicts.map((conflict) => ({
      ...conflict,
      mine: this.local[JSON.stringify(conflict.path)],
    }))
    // A rejected validation/auth request is known not to have committed. A
    // corrected edit can create a fresh request. Transport failures retain the
    // original receipt identity until an explicit retry confirms its outcome.
    if (!this.pending) this.error = null
    this.schedule()
  }

  resolve(path: string[], choice: 'mine' | 'shared') {
    if (this.saving || this.pending || !this.options.canEdit()) return
    const key = JSON.stringify(path)
    if (choice === 'shared') copySlot(this.local, this.base, key)
    this.conflicts = this.conflicts.filter((conflict) => JSON.stringify(conflict.path) !== key)
    this.error = null
    this.schedule()
  }

  private receiveDeferred() {
    if (!this.deferred) return
    const deferred = this.deferred
    this.deferred = null
    this.receive(deferred)
  }

  cancelAutoSave() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  schedule() {
    this.cancelAutoSave()
    if (
      this.disposed ||
      !this.options.canEdit() ||
      this.conflicts.length ||
      this.error ||
      !this.dirty
    )
      return
    this.timer = setTimeout(() => {
      void this.flush()
    }, this.options.delay ?? 900)
  }

  async flush(): Promise<boolean> {
    this.cancelAutoSave()
    if (this.disposed) return false
    if (this.running) return this.running
    const run = async () => {
      if (this.options.flushEditors && !(await this.options.flushEditors())) return false
      if (this.disposed || this.options.hasPendingEditors?.()) return false
      this.receiveDeferred()
      if (!this.pending) this.error = null
      if (!this.options.canEdit()) return !this.hasPendingWork
      if (this.conflicts.length) return false
      while (this.dirty || this.pending) {
        if (this.disposed || !this.options.canEdit()) return false
        const request = this.pending ?? {
          entryId: this.options.entryId,
          expectedDraftVersion: this.version,
          patch: this.patch,
          concurrency: {
            requestId: this.options.requestId?.() ?? crypto.randomUUID(),
            localeDraftIds: Object.fromEntries(
              Object.keys(this.patch.locales ?? {}).flatMap((locale) =>
                this.localeDraftIds[locale] ? [[locale, this.localeDraftIds[locale]!]] : [],
              ),
            ),
            base: patchFromSlots(this.base, this.shape),
          },
        }
        this.pending = clone(request)
        this.saving = true
        this.error = null
        try {
          const result = await this.options.save(request)
          if (this.disposed) return false
          const before = slots(request.concurrency.base)
          const sent = slots(request.patch)
          for (const key of new Set([...Object.keys(before), ...Object.keys(sent)])) {
            if (!equal(before[key], sent[key])) copySlot(this.base, sent, key)
          }
          this.version = Math.max(this.version, result.draftVersion)
          this.lastSaved = Date.now()
          this.pending = null
          this.saving = false
          this.receiveDeferred()
          if (this.conflicts.length) return false
        } catch (error) {
          this.error = error
          this.saving = false
          if (errorCode(error)) {
            this.pending = null
            this.receiveDeferred()
          }
          // Keep the identical request after an uncertain failure. The server's
          // user-bound receipt makes retry safe even if another editor saved later.
          return false
        }
      }
      return !this.options.hasPendingEditors?.()
    }
    this.running = run()
      .catch((error) => {
        // Editor/host flush failures must block navigation without producing an
        // unhandled autosave rejection or discarding the mounted visual document.
        this.error = error
        return false
      })
      .finally(() => {
        this.running = null
        this.saving = false
      })
    return this.running
  }

  dispose() {
    this.disposed = true
    this.cancelAutoSave()
  }
}
