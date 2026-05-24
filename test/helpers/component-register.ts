/// <reference types="vite/client" />

import type { TestConvex } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import schema from './schema.js'

const modules = import.meta.glob('./**/*.{ts,js}')

export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = 'ginkoCms',
) {
  t.registerComponent(name, schema as never, modules as never)
}

export { modules, schema }

export default { register, schema, modules }
