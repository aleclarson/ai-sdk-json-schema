import { describe, expect, test } from 'bun:test'

import { generatedCatalog } from '../src/catalog'
import {
  textModelConfigJsonSchema,
  textModelConfigJsonSchemasByProvider,
  textModelConfigSchema,
  textModelConfigSchemasByProvider,
} from '../src/schema'

function getFirstProviderEntry() {
  const [providerId, provider] = Object.entries(generatedCatalog.providers)[0]!
  const [modelId, model] = Object.entries(provider.models)[0]!

  return {
    providerId,
    provider,
    modelId,
    model,
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

  test('rejects an invalid provider/model pair', () => {
    const providerEntries = Object.entries(generatedCatalog.providers)
    const [leftProviderId, leftProvider] = providerEntries[0]!
    const [rightProviderId, rightProvider] = providerEntries.find(
      ([providerId]) => providerId !== leftProviderId,
    )!
    const invalidModelId =
      Object.keys(rightProvider.models).find((modelId) => !(modelId in leftProvider.models)) ??
      '__definitely-invalid__'

    expect(() =>
      textModelConfigSchema.parse({
        provider: leftProviderId,
        model: invalidModelId,
      }),
    ).toThrow()

    expect(() =>
      textModelConfigSchemasByProvider[leftProvider.id]!.parse({
        provider: leftProviderId,
        model: invalidModelId,
      }),
    ).toThrow()

    expect(
      textModelConfigSchemasByProvider[rightProvider.id]!.parse({
        provider: rightProviderId,
        model: invalidModelId,
      }),
    ).toEqual({
      provider: rightProviderId,
      model: invalidModelId,
    })
  })

  test('emits JSON Schema with model titles and descriptions', () => {
    const { providerId, modelId, model } = getFirstProviderEntry()
    const providerSchema = textModelConfigJsonSchemasByProvider[providerId]
    const serialized = JSON.stringify(providerSchema)

    expect(serialized).toContain(modelId)
    expect(serialized).toContain(model.name)
    expect(JSON.stringify(textModelConfigJsonSchema)).toContain(providerId)
  })
})
