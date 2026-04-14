import type { ModelShape } from './internal/catalog-types'

/**
 * Generic JSON Schema object emitted from the generated Zod schemas.
 */
export type JsonSchemaObject = Record<string, unknown>

/**
 * Minimal JSON configuration accepted by the library.
 *
 * Credentials and package-specific factory options are intentionally excluded.
 */
export interface TextModelConfig {
  provider: string
  model: string
}

/**
 * Resolved metadata for a validated text-model selection.
 *
 * Returned by {@link resolveTextModel} and embedded in text-model load plans.
 *
 * When `catalogMatch` is `false`, the model id was not present in the generated
 * catalog and provider defaults were used for runtime resolution.
 */
export interface TextModelDescriptor extends TextModelConfig {
  providerName: string
  providerDoc: string
  env: readonly string[]
  catalogMatch: boolean
  name: string
  family?: string
  attachment?: boolean
  reasoning?: boolean
  toolCall?: boolean
  structuredOutput?: boolean
  temperature?: boolean
  knowledge?: string
  releaseDate?: string
  lastUpdated?: string
  modalities?: {
    input: readonly string[]
    output: readonly string[]
  }
  packageName: string
  api?: string
  shape?: ModelShape
}

/**
 * A module import target inside a text-model load plan.
 */
export interface TextModelModulePlan {
  role: string
  specifier: string
  packageName: string
  exportName: string
}

/**
 * A fully resolved module import target inside a text-model load plan.
 */
export interface ResolvedTextModelModule extends TextModelModulePlan {
  resolvedPath: string
  fileUrl: string
}

/**
 * References a previously created binding inside a load-plan operation.
 */
export interface TextModelBindingArgument {
  kind: 'binding'
  binding: string
}

/**
 * Inlines a literal value inside a load-plan operation.
 */
export interface TextModelValueArgument {
  kind: 'value'
  value: unknown
}

/**
 * Argument payload used by load-plan operations.
 */
export type TextModelLoadArgument = TextModelBindingArgument | TextModelValueArgument

/**
 * Creates a named binding by calling an exported factory from a resolved module.
 */
export interface TextModelCreateBindingOperation {
  kind: 'create-binding'
  binding: string
  moduleRole: string
  options?: Record<string, unknown>
}

/**
 * Invokes a previously created binding, optionally through one of its methods.
 */
export interface TextModelInvokeBindingOperation {
  kind: 'invoke-binding'
  binding: string
  targetBinding: string
  methodName?: string
  args: TextModelLoadArgument[]
}

/**
 * The normalized execution steps needed to construct a text model.
 */
export type TextModelLoadOperation =
  | TextModelCreateBindingOperation
  | TextModelInvokeBindingOperation

/**
 * Adapter-aware runtime plan that has not been resolved against the filesystem.
 */
export interface UnresolvedTextModelLoadPlan {
  stage: 'unresolved'
  descriptor: TextModelDescriptor
  adapterId: string
  modules: TextModelModulePlan[]
  operations: TextModelLoadOperation[]
  resultBinding: string
}

/**
 * Filesystem-resolved runtime plan for loading a configured text model.
 */
export interface ResolvedTextModelLoadPlan {
  stage: 'resolved'
  descriptor: TextModelDescriptor
  adapterId: string
  modules: ResolvedTextModelModule[]
  operations: TextModelLoadOperation[]
  resultBinding: string
}

/**
 * Runtime-only options used while building a text-model load plan.
 */
export interface BuildTextModelLoadPlanOptions {
  env?: Record<string, string | undefined>
  packageOptions?: unknown
}

/**
 * Runtime-only options used while resolving a text-model load plan.
 */
export interface ResolveTextModelModulesOptions {
  installationRoot: string
}

/**
 * Runtime-only options used while executing an unresolved text-model load plan.
 */
export interface ExecuteUnresolvedTextModelLoadPlanOptions {
  loadModule: (module: TextModelModulePlan) => Promise<Record<string, unknown>>
}

/**
 * Runtime-only options used while executing a resolved text-model load plan.
 */
export interface ExecuteResolvedTextModelLoadPlanOptions {
  loadModule?: (module: ResolvedTextModelModule) => Promise<Record<string, unknown>>
}

/**
 * Runtime-only options used by the convenience `loadTextModel` helper.
 */
export interface LoadTextModelOptions extends BuildTextModelLoadPlanOptions {
  installationRoot?: string
}
