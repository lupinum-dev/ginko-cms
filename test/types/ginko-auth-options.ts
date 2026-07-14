import type { GinkoAuthOptions } from '../../packages/convex/src/convex.auth.js'

const supportedOptions = {
  emailPassword: false,
  trustedOrigins: ['https://cms.example.com'],
} satisfies GinkoAuthOptions

// @ts-expect-error Ginko owns the fixed Better Auth plugin and schema tuple.
const unsupportedPlugins: GinkoAuthOptions = { plugins: [] }

// @ts-expect-error Hosts cannot replace the Ginko-owned auth database adapter.
const unsupportedDatabase: GinkoAuthOptions = { database: {} }

void supportedOptions
void unsupportedPlugins
void unsupportedDatabase
