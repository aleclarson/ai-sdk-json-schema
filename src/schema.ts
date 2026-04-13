import { z } from 'zod'

import { generatedCatalog } from './generated/catalog'
import type { GeneratedTextProvider } from './internal/catalog-types'
import type { JsonSchemaObject, TextModelConfig } from './types'

function createModelSchema(provider: GeneratedTextProvider) {
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

function createProviderSchema(provider: GeneratedTextProvider) {
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

const providerSchemas = Object.fromEntries(
  Object.values(generatedCatalog.providers).map((provider) => [
    provider.id,
    createProviderSchema(provider),
  ]),
)

const providerSchemaValues = Object.values(providerSchemas)
const rootSchema = unionSchemas(providerSchemaValues)

/**
 * Provider-scoped Zod schemas for validating `{ provider, model }` pairs.
 */
export const textModelConfigSchemasByProvider = providerSchemas as Record<
  string,
  z.ZodType<TextModelConfig>
>

/**
 * Top-level Zod schema for validating the narrow JSON config surface exposed by
 * this library.
 */
export const textModelConfigSchema = rootSchema as z.ZodType<TextModelConfig>

/**
 * Provider-scoped JSON Schemas generated from the corresponding Zod schemas.
 */
export const textModelConfigJsonSchemasByProvider = Object.fromEntries(
  Object.entries(textModelConfigSchemasByProvider).map(([providerId, schema]) => [
    providerId,
    z.toJSONSchema(schema, {
      target: 'draft-2020-12',
    }) as JsonSchemaObject,
  ]),
) as Record<string, JsonSchemaObject>

/**
 * Top-level JSON Schema generated from {@link textModelConfigSchema}.
 */
export const textModelConfigJsonSchema = z.toJSONSchema(textModelConfigSchema, {
  target: 'draft-2020-12',
}) as JsonSchemaObject
