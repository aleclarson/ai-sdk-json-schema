import {
  generatedCatalog,
  textModelConfigJsonSchemasByProvider,
  textModelConfigSchema,
  textModelConfigSchemasByProvider,
} from 'ai-sdk-json-schema'

const [providerId, provider] = Object.entries(generatedCatalog.providers).find(
  ([, provider]) => Object.keys(provider.models).length > 0,
)!
const [modelId] = Object.keys(provider.models)

const config = textModelConfigSchema.parse({
  provider: providerId,
  model: modelId,
})

const providerConfig = textModelConfigSchemasByProvider[providerId]!.parse(config)
const providerJsonSchema = textModelConfigJsonSchemasByProvider[providerId]!

console.log(config)
console.log(providerConfig)
console.log({
  title: providerJsonSchema.title,
  description: providerJsonSchema.description,
})
