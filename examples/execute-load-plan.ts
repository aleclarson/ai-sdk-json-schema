import {
  buildTextModelLoadPlan,
  executeTextModelLoadPlan,
  generatedCatalog,
} from 'ai-sdk-json-schema'

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
const plan = buildTextModelLoadPlan(config)
const model = await executeTextModelLoadPlan(plan, {
  async loadModule(module) {
    switch (module.packageName) {
      case '@ai-sdk/openai':
        return (await import('@ai-sdk/openai')) as Record<string, unknown>
      default:
        throw new Error(`No bundled loader is configured for ${module.packageName}`)
    }
  },
})

console.log({
  stage: plan.stage,
  packages: [...new Set(plan.modules.map((module) => module.packageName))],
  loadedType: typeof model,
})
