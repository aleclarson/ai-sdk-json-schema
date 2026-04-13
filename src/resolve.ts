import process from 'node:process'

import { z } from 'zod'

import { UnknownModelError, UnknownProviderError, InvalidProviderModuleError } from './errors'
import { generatedCatalog } from './generated/catalog'
import { buildUnresolvedTextModelLoadPlan } from './runtime/adapters'
import {
  expandTemplate,
  loadModuleExports,
  resolveModulePlans,
  resolveOperationArgument,
} from './runtime/utils'
import type {
  ResolveTextModelLoadPlanOptions,
  TextModelConfig,
  TextModelDescriptor,
  TextModelLoadPlan,
} from './types'

const textModelConfigInputSchema = z.object({
  provider: z.string(),
  model: z.string(),
})

function createDescriptor(config: TextModelConfig): TextModelDescriptor {
  const provider = generatedCatalog.providers[config.provider]

  if (!provider) {
    throw new UnknownProviderError(config.provider)
  }

  const model = provider.models[config.model]

  if (!model) {
    throw new UnknownModelError(config.provider, config.model)
  }

  return {
    provider: provider.id,
    providerName: provider.name,
    providerDoc: provider.doc,
    env: provider.env,
    model: model.id,
    name: model.name,
    family: model.family,
    attachment: model.attachment,
    reasoning: model.reasoning,
    toolCall: model.toolCall,
    structuredOutput: model.structuredOutput,
    temperature: model.temperature,
    knowledge: model.knowledge,
    releaseDate: model.releaseDate,
    lastUpdated: model.lastUpdated,
    modalities: model.modalities,
    packageName: model.packageName,
    api: model.api,
    shape: model.shape,
  }
}

function getCallable(
  value: unknown,
  moduleRole: string,
  exportName: string,
): (...args: unknown[]) => unknown {
  if (typeof value === 'function') {
    return value as (...args: unknown[]) => unknown
  }

  throw new InvalidProviderModuleError({
    specifier: moduleRole,
    resolvedPath: moduleRole,
    exportName,
  })
}

/**
 * Validates a `{ provider, model }` config and returns the generated catalog
 * metadata for that selection.
 *
 * This performs no filesystem resolution and does not import provider packages.
 */
export function resolveTextModel(config: unknown): TextModelDescriptor {
  const parsedConfig = textModelConfigInputSchema.parse(config)
  return createDescriptor(parsedConfig)
}

/**
 * Resolves the exact module import plan required to load a validated text model
 * from an installation root.
 *
 * The returned plan expands template variables, resolves every module specifier
 * to an absolute path and file URL, and describes the binding operations needed
 * to construct the final model without importing anything.
 */
export function resolveTextModelLoadPlan(
  config: unknown,
  options: ResolveTextModelLoadPlanOptions = {},
): TextModelLoadPlan {
  const descriptor = resolveTextModel(config)
  const expandedDescriptor = {
    ...descriptor,
    api: expandTemplate(descriptor.api, options.env),
  }
  const unresolvedPlan = buildUnresolvedTextModelLoadPlan(
    expandedDescriptor,
    options.packageOptions,
  )
  const installationRoot = options.installationRoot ?? process.cwd()
  const modules = resolveModulePlans(
    installationRoot,
    expandedDescriptor.packageName,
    unresolvedPlan.modules,
  )

  return {
    descriptor: expandedDescriptor,
    adapterId: unresolvedPlan.adapterId,
    modules,
    operations: unresolvedPlan.operations,
    resultBinding: unresolvedPlan.resultBinding,
  }
}

/**
 * Loads and executes the resolved module plan for a validated text-model
 * configuration.
 *
 * The return type is intentionally broad because supported provider packages do
 * not all expose the same concrete model type across SDK generations.
 */
export async function loadTextModel(
  config: unknown,
  options: ResolveTextModelLoadPlanOptions = {},
): Promise<unknown> {
  const plan = resolveTextModelLoadPlan(config, options)
  const modulesByRole = new Map(plan.modules.map((module) => [module.role, module]))
  const exportsByRole = new Map<string, Record<string, unknown>>()

  for (const module of plan.modules) {
    exportsByRole.set(module.role, await loadModuleExports(module))
  }

  const bindings = new Map<string, unknown>()

  for (const operation of plan.operations) {
    if (operation.kind === 'create-binding') {
      const module = modulesByRole.get(operation.moduleRole)
      const loaded = exportsByRole.get(operation.moduleRole)

      if (!module || !loaded) {
        throw new InvalidProviderModuleError({
          specifier: operation.moduleRole,
          resolvedPath: operation.moduleRole,
          exportName: operation.moduleRole,
        })
      }

      const exportedValue = loaded[module.exportName]
      const callable = getCallable(exportedValue, module.specifier, module.exportName)

      bindings.set(operation.binding, callable(operation.options))
      continue
    }

    const target = bindings.get(operation.targetBinding)
    const args = operation.args.map((argument) => resolveOperationArgument(bindings, argument))

    if (operation.methodName) {
      if (!target || typeof target !== 'object') {
        throw new InvalidProviderModuleError({
          specifier: operation.targetBinding,
          resolvedPath: operation.targetBinding,
          exportName: operation.methodName,
        })
      }

      const methodValue = (target as Record<string, unknown>)[operation.methodName]
      const callable = getCallable(methodValue, operation.targetBinding, operation.methodName)

      bindings.set(operation.binding, callable(...args))
      continue
    }

    const callable = getCallable(target, operation.targetBinding, operation.targetBinding)
    bindings.set(operation.binding, callable(...args))
  }

  return bindings.get(plan.resultBinding)
}
