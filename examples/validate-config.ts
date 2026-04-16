import {
  textModelCatalog,
  textModelConfigJsonSchemasByProvider,
  textModelConfigSchema,
  textModelConfigSchemasByProvider,
  transcriptionModelCatalog,
  transcriptionModelConfigJsonSchemasByProvider,
  transcriptionModelConfigSchema,
  transcriptionModelConfigSchemasByProvider,
} from 'ai-sdk-json-schema'

const [textProviderId, textProvider] = Object.entries(textModelCatalog.providers).find(
  ([, provider]) => Object.keys(provider.models).length > 0,
)!
const [textModelId] = Object.keys(textProvider.models)

const textConfig = textModelConfigSchema.parse({
  provider: textProviderId,
  model: textModelId,
})

const parsedTextProviderConfig = textModelConfigSchemasByProvider[textProviderId]!.parse(textConfig)
const textProviderJsonSchema = textModelConfigJsonSchemasByProvider[textProviderId]!

const [transcriptionProviderId, transcriptionProvider] = Object.entries(
  transcriptionModelCatalog.providers,
).find(([, provider]) => Object.keys(provider.models).length > 0)!
const [transcriptionModelId] = Object.keys(transcriptionProvider.models)

const transcriptionConfig = transcriptionModelConfigSchema.parse({
  provider: transcriptionProviderId,
  model: transcriptionModelId,
})

const parsedTranscriptionProviderConfig =
  transcriptionModelConfigSchemasByProvider[transcriptionProviderId]!.parse(transcriptionConfig)
const transcriptionProviderJsonSchema =
  transcriptionModelConfigJsonSchemasByProvider[transcriptionProviderId]!

console.log(textConfig)
console.log(parsedTextProviderConfig)
console.log({
  title: textProviderJsonSchema.title,
  description: textProviderJsonSchema.description,
})
console.log(transcriptionConfig)
console.log(parsedTranscriptionProviderConfig)
console.log({
  title: transcriptionProviderJsonSchema.title,
  description: transcriptionProviderJsonSchema.description,
})
