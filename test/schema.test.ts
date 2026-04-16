import { describe, expect, test } from 'bun:test'

import { textModelCatalog } from '../src/generated/text-model-catalog'
import { transcriptionModelCatalog } from '../src/generated/transcription-model-catalog'
import type { GeneratedCatalog, GeneratedCatalogProviderBase } from '../src/internal/catalog-types'
import {
  textModelConfigJsonSchema,
  textModelConfigJsonSchemasByProvider,
  textModelConfigSchema,
  textModelConfigSchemasByProvider,
  transcriptionModelConfigJsonSchema,
  transcriptionModelConfigJsonSchemasByProvider,
  transcriptionModelConfigSchema,
  transcriptionModelConfigSchemasByProvider,
} from '../src/schema'

type SchemaCatalog = GeneratedCatalog<
  GeneratedCatalogProviderBase<{
    id: string
    name: string
  }>
>

function getFirstProviderEntry(catalog: SchemaCatalog) {
  const [providerId, provider] = Object.entries(catalog.providers).find(
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

function getFirstProviderWithoutModels(catalog: SchemaCatalog) {
  const [providerId, provider] = Object.entries(catalog.providers).find(
    ([, provider]) => Object.keys(provider.models).length === 0,
  )!

  return {
    providerId,
    provider,
  }
}

function runSharedSchemaTests(args: {
  label: string
  catalog: SchemaCatalog
  configSchema: typeof textModelConfigSchema
  configSchemasByProvider: typeof textModelConfigSchemasByProvider
  configJsonSchema: typeof textModelConfigJsonSchema
  configJsonSchemasByProvider: typeof textModelConfigJsonSchemasByProvider
}) {
  describe(args.label, () => {
    test('parses a valid provider/model pair', () => {
      const { providerId, modelId } = getFirstProviderEntry(args.catalog)

      expect(
        args.configSchema.parse({
          provider: providerId,
          model: modelId,
        }),
      ).toEqual({
        provider: providerId,
        model: modelId,
      })
    })

    test('accepts unknown model ids for known providers', () => {
      const { providerId } = getFirstProviderEntry(args.catalog)
      const config = {
        provider: providerId,
        model: 'brand-new-model-id',
      }

      expect(args.configSchema.parse(config)).toEqual(config)
      expect(args.configSchemasByProvider[providerId]!.parse(config)).toEqual(config)
    })

    test('rejects an unknown provider', () => {
      expect(() =>
        args.configSchema.parse({
          provider: '__definitely-invalid__',
          model: 'anything',
        }),
      ).toThrow()
    })

    test('accepts providers that currently have no bundled model examples', () => {
      const { providerId } = getFirstProviderWithoutModels(args.catalog)
      const providerSchema = args.configJsonSchemasByProvider[providerId]
      const modelSchema = (providerSchema.properties as Record<string, unknown>).model as Record<
        string,
        unknown
      >

      expect(
        args.configSchemasByProvider[providerId]!.parse({
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
      const { providerId, modelId } = getFirstProviderEntry(args.catalog)
      const providerSchema = args.configJsonSchemasByProvider[providerId]
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
      expect(JSON.stringify(args.configJsonSchema)).toContain(providerId)
    })
  })
}

runSharedSchemaTests({
  label: 'text schemas',
  catalog: textModelCatalog,
  configSchema: textModelConfigSchema,
  configSchemasByProvider: textModelConfigSchemasByProvider,
  configJsonSchema: textModelConfigJsonSchema,
  configJsonSchemasByProvider: textModelConfigJsonSchemasByProvider,
})

runSharedSchemaTests({
  label: 'transcription schemas',
  catalog: transcriptionModelCatalog,
  configSchema: transcriptionModelConfigSchema,
  configSchemasByProvider: transcriptionModelConfigSchemasByProvider,
  configJsonSchema: transcriptionModelConfigJsonSchema,
  configJsonSchemasByProvider: transcriptionModelConfigJsonSchemasByProvider,
})
