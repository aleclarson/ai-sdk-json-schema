import {
  loadTranscriptionModel,
  resolveModel,
  transcriptionModelCatalog,
} from 'ai-sdk-json-schema'

function findConfigByPackage(packageName: string) {
  for (const [providerId, provider] of Object.entries(transcriptionModelCatalog.providers)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (model.packageName === packageName) {
        return {
          provider: providerId,
          model: modelId,
        }
      }
    }
  }

  throw new Error(`No model found for package: ${packageName}`)
}

const config = findConfigByPackage('@ai-sdk/openai')
const descriptor = resolveModel('transcription', config)
const model = await loadTranscriptionModel(config, {
  installationRoot: process.cwd(),
})

console.log({
  mode: descriptor.mode,
  provider: descriptor.provider,
  model: descriptor.model,
  packageName: descriptor.packageName,
  loadedType: typeof model,
})
