import { generatedCatalog, loadTextModel, resolveTextModel } from 'ai-sdk-json-schema'

function findConfigByPackage(packageName: string) {
  for (const [providerId, provider] of Object.entries(generatedCatalog.providers)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      const isTextOnlyModel =
        model.modalities.output.length === 1 && model.modalities.output[0] === 'text'

      if (model.packageName === packageName && isTextOnlyModel) {
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
const descriptor = resolveTextModel(config)
const model = await loadTextModel(config, {
  installationRoot: process.cwd(),
})

console.log({
  provider: descriptor.provider,
  model: descriptor.model,
  packageName: descriptor.packageName,
  loadedType: typeof model,
})
