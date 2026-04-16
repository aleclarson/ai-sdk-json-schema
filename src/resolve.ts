import process from 'node:process'

import { z } from 'zod'

import { textModelCatalog } from './generated/text-model-catalog'
import { transcriptionModelCatalog } from './generated/transcription-model-catalog'
import {
  AdapterConfigurationError,
  InvalidProviderModuleError,
} from './errors'
import { createModelDescriptor } from './internal/resolve-descriptor'
import { buildUnresolvedModelLoadPlan } from './runtime/adapters'
import { expandTemplate, loadModuleExports, resolveModulePlans } from './runtime/utils'
import type {
  BuildModelLoadPlanOptions,
  ExecuteResolvedModelLoadPlanOptions,
  ExecuteUnresolvedModelLoadPlanOptions,
  LoadModelOptions,
  ModelConfig,
  ModelDescriptor,
  ModelLoadArgument,
  ModelMode,
  ModelModulePlan,
  ResolvedModelLoadPlan,
  ResolvedModelModule,
  ResolveModelModulesOptions,
  UnresolvedModelLoadPlan,
} from './types'

const modelConfigInputSchema = z.object({
  provider: z.string(),
  model: z.string(),
})

const GENERATED_CATALOGS = {
  textModelCatalog,
  transcriptionModelCatalog,
} as const

interface BindingSource {
  specifier: string
  resolvedPath?: string
  exportName: string
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
  module: ModelModulePlan | ResolvedModelModule,
  loadModule:
    | ((module: ModelModulePlan | ResolvedModelModule) => Promise<Record<string, unknown>>)
    | undefined,
): Promise<Record<string, unknown>> {
  if (loadModule) {
    return loadModule(module)
  }

  if ('resolvedPath' in module) {
    return loadModuleExports(module)
  }

  throw new TypeError(
    'executeModelLoadPlan requires options.loadModule when plan.stage is "unresolved"',
  )
}

function resolveExecutionArgument(
  adapterId: string,
  bindings: Map<string, unknown>,
  argument: ModelLoadArgument,
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
export function resolveModel(mode: ModelMode, config: unknown): ModelDescriptor {
  const parsedConfig = modelConfigInputSchema.parse(config)
  return createModelDescriptor(GENERATED_CATALOGS, mode, parsedConfig)
}

/**
 * Builds the adapter-aware runtime plan required to load a validated model,
 * without resolving modules from disk or importing anything.
 *
 * This is the host-facing planning boundary for custom package loading policy.
 * It expands catalog templates such as `${ENV_VAR}`, applies adapter logic, and
 * merges runtime `packageOptions` into the planned operations.
 *
 * Transcription planning is strict: it does not reinterpret transcription
 * selections as text-mode loads when a dedicated transcription adapter is
 * unavailable.
 */
export function buildModelLoadPlan(
  mode: ModelMode,
  config: unknown,
  options: BuildModelLoadPlanOptions = {},
): UnresolvedModelLoadPlan {
  const descriptor = resolveModel(mode, config)
  const expandedDescriptor = {
    ...descriptor,
    api: expandTemplate(descriptor.api, options.env),
  }
  const unresolvedPlan = buildUnresolvedModelLoadPlan(
    mode,
    expandedDescriptor,
    options.packageOptions,
  )

  return {
    stage: 'unresolved',
    mode,
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
export function resolveModelModules(
  plan: UnresolvedModelLoadPlan,
  options: ResolveModelModulesOptions,
): ResolvedModelLoadPlan {
  return {
    stage: 'resolved',
    mode: plan.mode,
    descriptor: plan.descriptor,
    adapterId: plan.adapterId,
    modules: resolveModulePlans(options.installationRoot, plan.modules),
    operations: plan.operations,
    resultBinding: plan.resultBinding,
  }
}

/**
 * Executes a model load plan and returns the constructed model instance.
 *
 * Unresolved plans require a host-provided `loadModule` callback. Resolved
 * plans use the callback when provided, otherwise they import the planned file
 * URLs directly.
 */
export function executeModelLoadPlan(
  plan: UnresolvedModelLoadPlan,
  options: ExecuteUnresolvedModelLoadPlanOptions,
): Promise<unknown>
export function executeModelLoadPlan(
  plan: ResolvedModelLoadPlan,
  options?: ExecuteResolvedModelLoadPlanOptions,
): Promise<unknown>
export async function executeModelLoadPlan(
  plan: UnresolvedModelLoadPlan | ResolvedModelLoadPlan,
  options:
    | ExecuteResolvedModelLoadPlanOptions
    | ExecuteUnresolvedModelLoadPlanOptions = {},
): Promise<unknown> {
  const modulesByRole = new Map(plan.modules.map((module) => [module.role, module]))
  const exportsByRole = new Map<string, Record<string, unknown>>()

  for (const module of plan.modules) {
    exportsByRole.set(
      module.role,
      await loadModuleForExecution(
        module,
        options.loadModule as
          | ((module: ModelModulePlan | ResolvedModelModule) => Promise<Record<string, unknown>>)
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
      if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
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
 */
export async function loadTextModel(
  config: unknown,
  options: LoadModelOptions = {},
): Promise<unknown> {
  const plan = buildModelLoadPlan('text', config, options)
  const resolvedPlan = resolveModelModules(plan, {
    installationRoot: options.installationRoot ?? process.cwd(),
  })

  return executeModelLoadPlan(resolvedPlan)
}

/**
 * Convenience helper that builds, resolves, and executes a transcription-model
 * load plan from a validated configuration.
 *
 * This helper is strict: it does not fall back to text-mode loading when the
 * selected transcription entry lacks a dedicated transcription adapter.
 */
export async function loadTranscriptionModel(
  config: unknown,
  options: LoadModelOptions = {},
): Promise<unknown> {
  const plan = buildModelLoadPlan('transcription', config, options)
  const resolvedPlan = resolveModelModules(plan, {
    installationRoot: options.installationRoot ?? process.cwd(),
  })

  return executeModelLoadPlan(resolvedPlan)
}
