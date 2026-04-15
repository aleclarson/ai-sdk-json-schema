import { describe, expect, test } from 'bun:test'

import { createJsonSchemaFileEntries, stringifyJsonSchema } from '../src/internal/json-schema-files'

describe('JSON schema file emission', () => {
  test('includes only the root schema', () => {
    const entries = createJsonSchemaFileEntries()

    expect(entries).toHaveLength(1)
    expect(entries[0]?.path).toBe('text-model-config.schema.json')
  })

  test('serializes schemas as newline-terminated JSON', () => {
    const [entry] = createJsonSchemaFileEntries()
    const json = stringifyJsonSchema(entry!.schema)

    expect(json.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(json)).not.toThrow()
  })
})
