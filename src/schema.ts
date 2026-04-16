import { z } from 'zod'

import { textModelCatalog } from './generated/text-model-catalog'
import { transcriptionModelCatalog } from './generated/transcription-model-catalog'
import type { GeneratedCatalog, GeneratedCatalogProviderBase } from './internal/catalog-types'
import type { JsonSchemaObject, ModelConfig } from './types'

function createModelSchema(provider: GeneratedCatalogProviderBase<unknown>) {
  const modelIds = Object.keys(provider.models)

  return z.string().meta({
    examples: modelIds.length > 0 ? modelIds : undefined,
  })
}

function unionSchemas(schemas: z.ZodTypeAny[]): z.ZodTypeAny {
  if (schemas.length === 0) {
    return z.never()
  }

  if (schemas.length === 1) {
    return schemas[0]!
  }

  return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
}

function createProviderSchema(provider: GeneratedCatalogProviderBase<unknown>) {
  return z
    .object({
      provider: z.literal(provider.id),
      model: createModelSchema(provider),
    })
    .meta({
      title: provider.name,
      description: provider.doc,
    })
}

function createSchemaBundle(catalog: GeneratedCatalog<GeneratedCatalogProviderBase<unknown>>) {
  const providerSchemas = Object.fromEntries(
    Object.values(catalog.providers).map((provider) => [provider.id, createProviderSchema(provider)]),
  ) as Record<string, z.ZodType<ModelConfig>>

  const rootSchema = unionSchemas(Object.values(providerSchemas)) as z.ZodType<ModelConfig>
  const providerJsonSchemas = Object.fromEntries(
    Object.entries(providerSchemas).map(([providerId, schema]) => [
      providerId,
      z.toJSONSchema(schema, {
        target: 'draft-2020-12',
      }) as JsonSchemaObject,
    ]),
  ) as Record<string, JsonSchemaObject>

  return {
    configSchemasByProvider: providerSchemas,
    configSchema: rootSchema,
    configJsonSchemasByProvider: providerJsonSchemas,
    configJsonSchema: z.toJSONSchema(rootSchema, {
      target: 'draft-2020-12',
    }) as JsonSchemaObject,
  }
}

const textSchemaBundle = createSchemaBundle(textModelCatalog)
const transcriptionSchemaBundle = createSchemaBundle(transcriptionModelCatalog)

/**
 * Provider-scoped Zod schemas for validating text `{ provider, model }` pairs.
 */
export const textModelConfigSchemasByProvider = textSchemaBundle.configSchemasByProvider

/**
 * Top-level Zod schema for validating text model config.
 */
export const textModelConfigSchema = textSchemaBundle.configSchema

/**
 * Provider-scoped JSON Schemas generated from the text Zod schemas.
 */
export const textModelConfigJsonSchemasByProvider = textSchemaBundle.configJsonSchemasByProvider

/**
 * Top-level JSON Schema generated from {@link textModelConfigSchema}.
 */
export const textModelConfigJsonSchema = textSchemaBundle.configJsonSchema

/**
 * Provider-scoped Zod schemas for validating transcription `{ provider, model }` pairs.
 */
export const transcriptionModelConfigSchemasByProvider =
  transcriptionSchemaBundle.configSchemasByProvider

/**
 * Top-level Zod schema for validating transcription model config.
 */
export const transcriptionModelConfigSchema = transcriptionSchemaBundle.configSchema

/**
 * Provider-scoped JSON Schemas generated from the transcription Zod schemas.
 */
export const transcriptionModelConfigJsonSchemasByProvider =
  transcriptionSchemaBundle.configJsonSchemasByProvider

/**
 * Top-level JSON Schema generated from {@link transcriptionModelConfigSchema}.
 */
export const transcriptionModelConfigJsonSchema = transcriptionSchemaBundle.configJsonSchema
