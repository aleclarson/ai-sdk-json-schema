import { textModelConfigJsonSchema, textModelConfigJsonSchemasByProvider } from '../schema'
import type { JsonSchemaObject } from '../types'

export interface JsonSchemaFileEntry {
  path: string
  schema: JsonSchemaObject
}

export function createJsonSchemaFileEntries(): JsonSchemaFileEntry[] {
  return [
    {
      path: 'text-model-config.schema.json',
      schema: textModelConfigJsonSchema,
    },
    ...Object.entries(textModelConfigJsonSchemasByProvider)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([providerId, schema]) => ({
        path: `providers/${providerId}.schema.json`,
        schema,
      })),
  ]
}

export function stringifyJsonSchema(schema: JsonSchemaObject): string {
  return `${JSON.stringify(schema, null, 2)}\n`
}
