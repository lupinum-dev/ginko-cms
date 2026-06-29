import { ConvexError } from 'convex/values'

export type CmsPermission<TIdentity = unknown> = {
  key: string
  label?: string
  check: (identity: TIdentity) => boolean
}

export function requireRecord<T>(record: T | null | undefined, label = 'Record'): T {
  if (record == null) {
    throw new ConvexError(`${label} not found`)
  }
  return record
}

export function cmsPermission<TIdentity>(permission: CmsPermission<TIdentity>) {
  return permission
}

export function cmsAccessContext<TDefinition>(definition: TDefinition): TDefinition {
  return definition
}

export function cmsGuard<TIdentity>(check: (identity: TIdentity) => boolean) {
  return check
}

export function open() {
  return true
}

export function can<TIdentity>(identity: TIdentity, permission: CmsPermission<TIdentity>) {
  return permission.check(identity)
}

export function cmsRecordAccess<TRecord>() {
  return <TAccess>(access: TAccess): TAccess => access
}

export async function getCmsAuth(_ctx: unknown) {
  return null
}

export async function requireCmsAuth(ctx: unknown) {
  const auth = await getCmsAuth(ctx)
  if (!auth) {
    throw new ConvexError('Unauthenticated')
  }
  return auth
}

export function deny(message = 'Forbidden'): never {
  throw new ConvexError(message)
}

export type DefineBetterAuthDeps = Record<string, unknown>
export type DefineBetterAuthOptions = Record<string, unknown>

export function defineBetterAuth(deps: DefineBetterAuthDeps, options: DefineBetterAuthOptions = {}) {
  return {
    deps,
    options,
  }
}
