import type { ModelShape, SupportedLoadMode } from './internal/catalog-types'

/**
 * Generic JSON Schema object emitted from the generated Zod schemas.
 */
export type JsonSchemaObject = Record<string, unknown>

/**
 * Runtime mode supported by the catalog and loading pipeline.
 */
export type ModelMode = SupportedLoadMode

/**
 * Minimal JSON configuration accepted by the library.
 *
 * Credentials and package-specific factory options are intentionally excluded.
 */
export interface ModelConfig {
  provider: string
  model: string
}

/**
 * Resolved metadata for a validated model selection.
 *
 * Returned by {@link resolveModel} and embedded in model load plans.
 *
 * When `catalogMatch` is `false`, the model id was not present in the selected
 * generated catalog and provider defaults were used for runtime resolution.
 */
export interface ModelDescriptor extends ModelConfig {
  mode: ModelMode
  providerName: string
  providerDoc: string
  env: readonly string[]
  catalogMatch: boolean
  name: string
  /**
   * Library runtime modes supported by the selected package.
   *
   * For transcription selections, this is package capability metadata only. It
   * does not cause text-mode resolution to consult the transcription catalog.
   */
  supportedLoadModes: readonly ModelMode[]
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
 * A module import target inside a model load plan.
 */
export interface ModelModulePlan {
  role: string
  specifier: string
  /**
   * Package identity for host-owned install or import policy decisions.
   */
  packageName: string
  exportName: string
}

/**
 * A fully resolved module import target inside a model load plan.
 */
export interface ResolvedModelModule extends ModelModulePlan {
  resolvedPath: string
  fileUrl: string
}

/**
 * References a previously created binding inside a load-plan operation.
 */
export interface ModelBindingArgument {
  kind: 'binding'
  binding: string
}

/**
 * Inlines a literal value inside a load-plan operation.
 */
export interface ModelValueArgument {
  kind: 'value'
  value: unknown
}

/**
 * Argument payload used by load-plan operations.
 */
export type ModelLoadArgument = ModelBindingArgument | ModelValueArgument

/**
 * Creates a named binding by calling an exported factory from a resolved module.
 */
export interface ModelCreateBindingOperation {
  kind: 'create-binding'
  binding: string
  moduleRole: string
  options?: Record<string, unknown>
}

/**
 * Invokes a previously created binding, optionally through one of its methods.
 */
export interface ModelInvokeBindingOperation {
  kind: 'invoke-binding'
  binding: string
  targetBinding: string
  methodName?: string
  args: ModelLoadArgument[]
}

/**
 * The normalized execution steps needed to construct a model instance.
 */
export type ModelLoadOperation = ModelCreateBindingOperation | ModelInvokeBindingOperation

/**
 * Adapter-aware runtime plan that has not been resolved against the filesystem.
 */
export interface UnresolvedModelLoadPlan {
  /**
   * Discriminant used by {@link executeModelLoadPlan}.
   */
  stage: 'unresolved'
  mode: ModelMode
  descriptor: ModelDescriptor
  adapterId: string
  modules: ModelModulePlan[]
  operations: ModelLoadOperation[]
  resultBinding: string
}

/**
 * Filesystem-resolved runtime plan for loading a configured model.
 */
export interface ResolvedModelLoadPlan {
  /**
   * Discriminant used by {@link executeModelLoadPlan}.
   */
  stage: 'resolved'
  mode: ModelMode
  descriptor: ModelDescriptor
  adapterId: string
  modules: ResolvedModelModule[]
  operations: ModelLoadOperation[]
  resultBinding: string
}

/**
 * Runtime-only options used while building a model load plan.
 */
export interface BuildModelLoadPlanOptions {
  env?: Record<string, string | undefined>
  packageOptions?: unknown
}

/**
 * Runtime-only options used while resolving a model load plan.
 */
export interface ResolveModelModulesOptions {
  installationRoot: string
}

/**
 * Runtime-only options used while executing an unresolved model load plan.
 */
export interface ExecuteUnresolvedModelLoadPlanOptions {
  /**
   * Host-supplied module loader used when the plan has not been resolved against
   * the filesystem.
   */
  loadModule: (module: ModelModulePlan) => Promise<Record<string, unknown>>
}

/**
 * Runtime-only options used while executing a resolved model load plan.
 */
export interface ExecuteResolvedModelLoadPlanOptions {
  /**
   * Optional override for the default file-URL-based module loading path.
   */
  loadModule?: (module: ResolvedModelModule) => Promise<Record<string, unknown>>
}

/**
 * Runtime-only options used by the convenience loader helpers.
 */
export interface LoadModelOptions extends BuildModelLoadPlanOptions {
  installationRoot?: string
}
