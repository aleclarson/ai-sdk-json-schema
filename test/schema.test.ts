import { describe, expect, test } from 'bun:test'

import { generatedCatalog } from '../src/catalog'
import {
  textModelConfigJsonSchema,
  textModelConfigJsonSchemasByProvider,
  textModelConfigSchema,
  textModelConfigSchemasByProvider,
} from '../src/schema'

function getFirstProviderEntry() {
  const [providerId, provider] = Object.entries(generatedCatalog.providers).find(
    ([, provider]) => Object.keys(provider.models).length > 0,
  )!
  const [modelId, model] = Object.entries(provider.models)[0]!

  return {
    providerId,
    provider,
    modelId,
    model,
  }
}

function getFirstProviderWithoutModels() {
  const [providerId, provider] = Object.entries(generatedCatalog.providers).find(
    ([, provider]) => Object.keys(provider.models).length === 0,
  )!

  return {
    providerId,
    provider,
  }
}

describe('schemas', () => {
  test('parses a valid provider/model pair', () => {
    const { providerId, modelId } = getFirstProviderEntry()

    expect(
      textModelConfigSchema.parse({
        provider: providerId,
        model: modelId,
      }),
    ).toEqual({
      provider: providerId,
      model: modelId,
    })
  })

  test('accepts unknown model ids for known providers', () => {
    const { providerId } = getFirstProviderEntry()
    const config = {
      provider: providerId,
      model: 'brand-new-model-id',
    }

    expect(textModelConfigSchema.parse(config)).toEqual(config)

    expect(textModelConfigSchemasByProvider[providerId]!.parse(config)).toEqual(config)
  })

  test('rejects an unknown provider', () => {
    expect(() =>
      textModelConfigSchema.parse({
        provider: '__definitely-invalid__',
        model: 'anything',
      }),
    ).toThrow()
  })

  test('accepts providers that currently have no bundled model examples', () => {
    const { providerId } = getFirstProviderWithoutModels()
    const providerSchema = textModelConfigJsonSchemasByProvider[providerId]
    const modelSchema = (providerSchema.properties as Record<string, unknown>).model as Record<
      string,
      unknown
    >

    expect(
      textModelConfigSchemasByProvider[providerId]!.parse({
        provider: providerId,
        model: 'future-model-id',
      }),
    ).toEqual({
      provider: providerId,
      model: 'future-model-id',
    })
    expect(modelSchema.type).toBe('string')
    expect(modelSchema.examples).toBeUndefined()
  })

  test('emits JSON Schema with model examples and no markdownDescription', () => {
    const { providerId, modelId, model } = getFirstProviderEntry()
    const providerSchema = textModelConfigJsonSchemasByProvider[providerId]
    const serialized = JSON.stringify(providerSchema)
    const modelSchema = (providerSchema.properties as Record<string, unknown>).model as Record<
      string,
      unknown
    >

    expect(serialized).toContain(modelId)
    expect((modelSchema.examples as unknown[] | undefined)?.includes(modelId)).toBe(true)
    expect(modelSchema.type).toBe('string')
    expect(modelSchema.anyOf).toBeUndefined()
    expect(modelSchema.title).toBeUndefined()
    expect(modelSchema.description).toBeUndefined()
    expect(serialized).not.toContain('"markdownDescription"')
    expect(JSON.stringify(textModelConfigJsonSchema)).toContain(providerId)
  })
})
