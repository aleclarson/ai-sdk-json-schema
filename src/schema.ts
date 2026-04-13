import { z } from 'zod'

import { generatedCatalog } from './generated/catalog'
import type { GeneratedTextModel, GeneratedTextProvider } from './internal/catalog-types'
import type { JsonSchemaObject, TextModelConfig } from './types'

function createModelDescription(
  provider: GeneratedTextProvider,
  model: GeneratedTextModel,
): string {
  const features = [
    model.reasoning ? 'reasoning' : null,
    model.toolCall ? 'tool calling' : null,
    model.structuredOutput ? 'structured output' : null,
    model.temperature ? 'temperature' : null,
  ].filter(Boolean)

  const parts = [
    `${provider.name} / ${model.name}`,
    `ID: ${provider.id}/${model.id}`,
    `Package: ${model.packageName}`,
  ]

  if (features.length > 0) {
    parts.push(`Features: ${features.join(', ')}`)
  }

  if (model.knowledge) {
    parts.push(`Knowledge cutoff: ${model.knowledge}`)
  }

  return parts.join(' | ')
}

function createModelSchema(provider: GeneratedTextProvider, model: GeneratedTextModel) {
  const description = createModelDescription(provider, model)

  return z.literal(model.id).describe(description).meta({
    title: model.name,
    description,
    markdownDescription: description,
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
  const modelSchemas = Object.values(provider.models).map((model) =>
    createModelSchema(provider, model),
  )
  const modelSchema = unionSchemas(modelSchemas)

  return z
    .object({
      provider: z.literal(provider.id),
      model: modelSchema,
    })
    .meta({
      title: provider.name,
      description: provider.doc,
      markdownDescription: provider.doc,
    })
}

const providerSchemas = Object.fromEntries(
  Object.values(generatedCatalog.providers)
    .filter((provider) => Object.keys(provider.models).length > 0)
    .map((provider) => [provider.id, createProviderSchema(provider)]),
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
