import process from 'node:process'

import { z } from 'zod'

import {
  AdapterConfigurationError,
  InvalidProviderModuleError,
  UnknownProviderError,
} from './errors'
import { generatedCatalog } from './generated/catalog'
import { buildUnresolvedTextModelLoadPlan } from './runtime/adapters'
import {
  expandTemplate,
  loadModuleExports,
  resolveModulePlans,
} from './runtime/utils'
import type {
  BuildTextModelLoadPlanOptions,
  ExecuteResolvedTextModelLoadPlanOptions,
  ExecuteUnresolvedTextModelLoadPlanOptions,
  LoadTextModelOptions,
  ResolvedTextModelLoadPlan,
  ResolvedTextModelModule,
  ResolveTextModelModulesOptions,
  TextModelConfig,
  TextModelDescriptor,
  TextModelLoadArgument,
  TextModelModulePlan,
  UnresolvedTextModelLoadPlan,
} from './types'

const textModelConfigInputSchema = z.object({
  provider: z.string(),
  model: z.string(),
})

interface BindingSource {
  specifier: string
  resolvedPath?: string
  exportName: string
}

function createDescriptor(config: TextModelConfig): TextModelDescriptor {
  const provider = generatedCatalog.providers[config.provider]

  if (!provider) {
    throw new UnknownProviderError(config.provider)
  }

  const model = provider.models[config.model]
  const baseDescriptor = {
    provider: provider.id,
    providerName: provider.name,
    providerDoc: provider.doc,
    env: provider.env,
    model: config.model,
  }

  if (!model) {
    return {
      ...baseDescriptor,
      catalogMatch: false,
      name: config.model,
      packageName: provider.packageName,
      api: provider.api,
      shape: provider.shape,
    }
  }

  return {
    ...baseDescriptor,
    catalogMatch: true,
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
  source: BindingSource,
  exportName: string = source.exportName,
): (...args: unknown[]) => unknown {
  if (typeof value === 'function') {
    return value as (...args: unknown[]) => unknown
  }

  throw new InvalidProviderModuleError({
    specifier: source.specifier,
    resolvedPath: source.resolvedPath,
    exportName,
  })
}

async function loadModuleForExecution(
  module: TextModelModulePlan | ResolvedTextModelModule,
  loadModule:
    | ((module: TextModelModulePlan | ResolvedTextModelModule) => Promise<Record<string, unknown>>)
    | undefined,
): Promise<Record<string, unknown>> {
  if (loadModule) {
    return loadModule(module)
  }

  if ('resolvedPath' in module) {
    return loadModuleExports(module)
  }

  throw new TypeError(
    'executeTextModelLoadPlan requires options.loadModule when plan.stage is "unresolved"',
  )
}

function resolveExecutionArgument(
  adapterId: string,
  bindings: Map<string, unknown>,
  argument: TextModelLoadArgument,
): unknown {
  if (argument.kind === 'value') {
    return argument.value
  }

  if (!bindings.has(argument.binding)) {
    throw new AdapterConfigurationError(
      adapterId,
      `Adapter "${adapterId}" references unknown binding "${argument.binding}"`,
    )
  }

  return bindings.get(argument.binding)
}

/**
 * Validates a `{ provider, model }` config and returns the generated catalog
 * metadata for that selection.
 *
 * This performs no filesystem resolution and does not import provider packages.
 * Unknown model ids are allowed and fall back to provider defaults.
 */
export function resolveTextModel(config: unknown): TextModelDescriptor {
  const parsedConfig = textModelConfigInputSchema.parse(config)
  return createDescriptor(parsedConfig)
}

/**
 * Builds the adapter-aware runtime plan required to load a validated text
 * model, without resolving modules from disk or importing anything.
 *
 * This is the host-facing planning boundary for custom package loading policy.
 * It expands catalog templates such as `${ENV_VAR}`, applies adapter logic, and
 * merges runtime `packageOptions` into the planned operations.
 */
export function buildTextModelLoadPlan(
  config: unknown,
  options: BuildTextModelLoadPlanOptions = {},
): UnresolvedTextModelLoadPlan {
  const descriptor = resolveTextModel(config)
  const expandedDescriptor = {
    ...descriptor,
    api: expandTemplate(descriptor.api, options.env),
  }
  const unresolvedPlan = buildUnresolvedTextModelLoadPlan(
    expandedDescriptor,
    options.packageOptions,
  )

  return {
    stage: 'unresolved',
    descriptor: expandedDescriptor,
    adapterId: unresolvedPlan.adapterId,
    modules: unresolvedPlan.modules,
    operations: unresolvedPlan.operations,
    resultBinding: unresolvedPlan.resultBinding,
  }
}

/**
 * Resolves each module specifier in an unresolved load plan relative to an
 * installation root, without importing anything.
 *
 * Use this only after the host has decided that package resolution should be
 * anchored to a concrete dependency root.
 */
export function resolveTextModelModules(
  plan: UnresolvedTextModelLoadPlan,
  options: ResolveTextModelModulesOptions,
): ResolvedTextModelLoadPlan {
  return {
    stage: 'resolved',
    descriptor: plan.descriptor,
    adapterId: plan.adapterId,
    modules: resolveModulePlans(options.installationRoot, plan.modules),
    operations: plan.operations,
    resultBinding: plan.resultBinding,
  }
}

/**
 * Executes a text-model load plan and returns the constructed model instance.
 *
 * Unresolved plans require a host-provided `loadModule` callback. Resolved
 * plans use the callback when provided, otherwise they import the planned file
 * URLs directly.
 */
export function executeTextModelLoadPlan(
  plan: UnresolvedTextModelLoadPlan,
  options: ExecuteUnresolvedTextModelLoadPlanOptions,
): Promise<unknown>
export function executeTextModelLoadPlan(
  plan: ResolvedTextModelLoadPlan,
  options?: ExecuteResolvedTextModelLoadPlanOptions,
): Promise<unknown>
export async function executeTextModelLoadPlan(
  plan: UnresolvedTextModelLoadPlan | ResolvedTextModelLoadPlan,
  options:
    | ExecuteResolvedTextModelLoadPlanOptions
    | ExecuteUnresolvedTextModelLoadPlanOptions = {},
): Promise<unknown> {
  const modulesByRole = new Map(plan.modules.map((module) => [module.role, module]))
  const exportsByRole = new Map<string, Record<string, unknown>>()

  for (const module of plan.modules) {
    exportsByRole.set(
      module.role,
      await loadModuleForExecution(
        module,
        options.loadModule as
          | ((module: TextModelModulePlan | ResolvedTextModelModule) => Promise<
              Record<string, unknown>
            >)
          | undefined,
      ),
    )
  }

  const bindings = new Map<string, unknown>()
  const bindingSources = new Map<string, BindingSource>()

  for (const operation of plan.operations) {
    if (operation.kind === 'create-binding') {
      const module = modulesByRole.get(operation.moduleRole)
      const loaded = exportsByRole.get(operation.moduleRole)

      if (!module || !loaded) {
        throw new AdapterConfigurationError(
          plan.adapterId,
          `Adapter "${plan.adapterId}" references unknown module role "${operation.moduleRole}"`,
        )
      }

      const moduleSource: BindingSource = {
        specifier: module.specifier,
        resolvedPath: 'resolvedPath' in module ? module.resolvedPath : undefined,
        exportName: module.exportName,
      }
      const exportedValue = loaded[module.exportName]
      const callable = getCallable(exportedValue, moduleSource)

      bindings.set(operation.binding, callable(operation.options))
      bindingSources.set(operation.binding, moduleSource)
      continue
    }

    const target = bindings.get(operation.targetBinding)
    const targetSource =
      bindingSources.get(operation.targetBinding) ?? {
        specifier: operation.targetBinding,
        exportName: operation.targetBinding,
      }
    const args = operation.args.map((argument) =>
      resolveExecutionArgument(plan.adapterId, bindings, argument),
    )

    if (operation.methodName) {
      if (!target || typeof target !== 'object') {
        throw new InvalidProviderModuleError({
          specifier: targetSource.specifier,
          resolvedPath: targetSource.resolvedPath,
          exportName: operation.methodName,
        })
      }

      const methodValue = (target as Record<string, unknown>)[operation.methodName]
      const callable = getCallable(methodValue, targetSource, operation.methodName)

      bindings.set(operation.binding, callable(...args))
      bindingSources.set(operation.binding, {
        specifier: targetSource.specifier,
        resolvedPath: targetSource.resolvedPath,
        exportName: operation.methodName,
      })
      continue
    }

    const callable = getCallable(target, targetSource)

    bindings.set(operation.binding, callable(...args))
    bindingSources.set(operation.binding, targetSource)
  }

  if (!bindings.has(plan.resultBinding)) {
    throw new AdapterConfigurationError(
      plan.adapterId,
      `Adapter "${plan.adapterId}" did not produce result binding "${plan.resultBinding}"`,
    )
  }

  return bindings.get(plan.resultBinding)
}

/**
 * Convenience helper that builds, resolves, and executes a text-model load
 * plan from a validated configuration.
 *
 * This is the simplest path for consumers that do not need custom provider
 * loading policy. Hosts that bundle some providers or install on demand should
 * use the three lower-level stages directly.
 */
export async function loadTextModel(
  config: unknown,
  options: LoadTextModelOptions = {},
): Promise<unknown> {
  const plan = buildTextModelLoadPlan(config, options)
  const resolvedPlan = resolveTextModelModules(plan, {
    installationRoot: options.installationRoot ?? process.cwd(),
  })

  return executeTextModelLoadPlan(resolvedPlan)
}
