import { buildModelLoadPlan, resolveModelModules, textModelCatalog } from 'ai-sdk-json-schema'

function findConfigForPackages(packageNames: readonly string[]) {
  for (const packageName of packageNames) {
    for (const [providerId, provider] of Object.entries(textModelCatalog.providers)) {
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
const unresolvedPlan = buildModelLoadPlan('text', config)
const resolvedPlan = resolveModelModules(unresolvedPlan, {
  installationRoot: process.cwd(),
})

console.log(unresolvedPlan.adapterId)
console.log(unresolvedPlan.modules)
console.log(resolvedPlan.modules)
console.log(unresolvedPlan.operations)
