// Re-export from contract so studio code's `#ginko-cms/permissions` import
// becomes `../composables/permissions` in the SPA via the codemod, with the
// same exported names and types.
export {
  cmsPermissionKeys,
  type CmsPermissionKey,
  type CmsPermissionMap,
} from '@contract/permissions'
