import { describe, expect, test } from 'bun:test'

import { createJsonSchemaFileEntries, stringifyJsonSchema } from '../src/internal/json-schema-files'
import { generatedCatalog } from '../src/catalog'

describe('JSON schema file emission', () => {
  test('includes the root schema and one schema per provider', () => {
    const entries = createJsonSchemaFileEntries()
    const providerIds = Object.keys(generatedCatalog.providers).sort()

    expect(entries[0]?.path).toBe('text-model-config.schema.json')
    expect(entries).toHaveLength(providerIds.length + 1)

    const providerPaths = entries.slice(1).map((entry) => entry.path)
    expect(providerPaths).toEqual(
      providerIds.map((providerId) => `providers/${providerId}.schema.json`),
    )
  })

  test('serializes schemas as newline-terminated JSON', () => {
    const [entry] = createJsonSchemaFileEntries()
    const json = stringifyJsonSchema(entry!.schema)

    expect(json.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(json)).not.toThrow()
  })
})
