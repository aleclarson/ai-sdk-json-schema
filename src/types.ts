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
 * Returned by {@link resolveTextModel} and embedded in {@link TextModelLoadPlan}.
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
 * A fully resolved module import target inside a {@link TextModelLoadPlan}.
 */
export interface ResolvedTextModelModule {
  role: string
  specifier: string
  resolvedPath: string
  fileUrl: string
  exportName: string
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
 * Import-free runtime plan for loading a configured text model.
 *
 * Use {@link resolveTextModelLoadPlan} when the host needs control over package
 * installation, auditing, or module loading before execution.
 */
export interface TextModelLoadPlan {
  descriptor: TextModelDescriptor
  adapterId: string
  modules: ResolvedTextModelModule[]
  operations: TextModelLoadOperation[]
  resultBinding: string
}

/**
 * Runtime-only options used while resolving or loading provider packages.
 */
export interface ResolveTextModelLoadPlanOptions {
  installationRoot?: string
  env?: Record<string, string | undefined>
  packageOptions?: unknown
}
