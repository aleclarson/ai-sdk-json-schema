import { generatedCatalog, resolveTextModelLoadPlan } from 'ai-sdk-json-schema'

function findConfigForPackages(packageNames: readonly string[]) {
  for (const packageName of packageNames) {
    for (const [providerId, provider] of Object.entries(generatedCatalog.providers)) {
      for (const [modelId, model] of Object.entries(provider.models)) {
        if (model.packageName === packageName) {
          return {
            provider: providerId,
            model: modelId,
          }
        }
      }
    }
  }

  throw new Error(`No model found for packages: ${packageNames.join(', ')}`)
}

const config = findConfigForPackages(['@openrouter/ai-sdk-provider', '@ai-sdk/openai'])
const plan = resolveTextModelLoadPlan(config, {
  installationRoot: process.cwd(),
})

console.log(plan.adapterId)
console.log(plan.modules)
console.log(plan.operations)
