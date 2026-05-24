import type { ObjectType, PropertyValidators } from 'convex/values'

type ValidatorNode = {
  kind?: string
  tableName?: string
  value?: unknown
}

export interface SchemaFieldMeta {
  label?: string
  description?: string
  examples?: unknown[]
  enum?: string[]
  defaultHint?: unknown
}

export type InputSchemaMeta<V extends PropertyValidators> = {
  [K in keyof V]?: SchemaFieldMeta
}

export type ResolvedSchemaMeta<V extends PropertyValidators> = {
  description?: string
  fields: {
    [K in keyof V]: Required<Pick<SchemaFieldMeta, 'label' | 'description'>> & SchemaFieldMeta
  }
}

export interface SchemaDefinition<_T, V extends PropertyValidators = PropertyValidators> {
  readonly description: string | undefined
  readonly args: V
  readonly meta: ResolvedSchemaMeta<V>
}

function titleCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function describeValidator(validator: ValidatorNode): string {
  switch (validator.kind) {
    case 'string':
      return 'A string value'
    case 'float64':
      return 'A number value'
    case 'boolean':
      return 'A boolean value'
    case 'id':
      return `A reference to a ${validator.tableName} document`
    case 'literal':
      return `The literal value ${JSON.stringify(validator.value)}`
    case 'array':
      return 'A list of values'
    default:
      return 'A value'
  }
}

function createResolvedMeta<V extends PropertyValidators>(
  validators: V,
  description: string | undefined,
  meta: InputSchemaMeta<V> | undefined,
): ResolvedSchemaMeta<V> {
  const fields = Object.fromEntries(
    Object.entries(validators).map(([key, validator]) => {
      const provided = meta?.[key as keyof V]
      const node = validator as ValidatorNode

      return [
        key,
        {
          label: provided?.label ?? titleCase(key),
          description: provided?.description ?? describeValidator(node),
          ...(provided?.examples ? { examples: provided.examples } : {}),
          ...(provided?.enum ? { enum: provided.enum } : {}),
          ...(provided?.defaultHint !== undefined ? { defaultHint: provided.defaultHint } : {}),
        },
      ]
    }),
  ) as ResolvedSchemaMeta<V>['fields']

  return {
    description,
    fields,
  }
}

export function defineArgs<V extends PropertyValidators>(definition: {
  description?: string
  args: V
  meta?: InputSchemaMeta<V>
}): SchemaDefinition<ObjectType<V>, V> {
  return {
    description: definition.description,
    args: definition.args,
    meta: createResolvedMeta(definition.args, definition.description, definition.meta),
  }
}
