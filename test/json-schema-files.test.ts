import { describe, expect, test } from 'bun:test'

import { createJsonSchemaFileEntries, stringifyJsonSchema } from '../src/internal/json-schema-files'

describe('JSON schema file emission', () => {
  test('includes both root schemas', () => {
    const entries = createJsonSchemaFileEntries()

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.path)).toEqual([
      'text-model-config.schema.json',
      'transcription-model-config.schema.json',
    ])
  })

  test('serializes schemas as newline-terminated JSON', () => {
    const entries = createJsonSchemaFileEntries()

    for (const entry of entries) {
      const json = stringifyJsonSchema(entry.schema)

      expect(json.endsWith('\n')).toBe(true)
      expect(() => JSON.parse(json)).not.toThrow()
    }
  })
})
