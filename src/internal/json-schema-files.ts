import {
  textModelConfigJsonSchema,
  transcriptionModelConfigJsonSchema,
} from '../schema'
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
    {
      path: 'transcription-model-config.schema.json',
      schema: transcriptionModelConfigJsonSchema,
    },
  ]
}

export function stringifyJsonSchema(schema: JsonSchemaObject): string {
  return `${JSON.stringify(schema, null, 2)}\n`
}
