import { loadTranscriptionModel, resolveModel, transcriptionModelCatalog } from 'ai-sdk-json-schema'

function findConfig() {
  for (const [providerId, provider] of Object.entries(transcriptionModelCatalog.providers)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (model.supportedLoadModes.includes('transcription')) {
        return {
          provider: providerId,
          model: modelId,
        }
      }
    }
  }

  throw new Error('No dedicated transcription model found in catalog')
}

const config = findConfig()
const descriptor = resolveModel('transcription', config)
const model = await loadTranscriptionModel(config, {
  installationRoot: process.cwd(),
})

console.log({
  mode: descriptor.mode,
  provider: descriptor.provider,
  model: descriptor.model,
  packageName: descriptor.packageName,
  supportedLoadModes: descriptor.supportedLoadModes,
  loadedType: typeof model,
})
