import { buildTextModelLoadPlan, generatedCatalog, resolveTextModelModules } from 'ai-sdk-json-schema'

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
const unresolvedPlan = buildTextModelLoadPlan(config)
const resolvedPlan = resolveTextModelModules(unresolvedPlan, {
  installationRoot: process.cwd(),
})

console.log(unresolvedPlan.adapterId)
console.log(unresolvedPlan.modules)
console.log(resolvedPlan.modules)
console.log(unresolvedPlan.operations)
