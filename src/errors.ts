/**
 * Thrown when a config references a provider id that is not present in the
 * generated catalog.
 */
export class UnknownProviderError extends Error {
  readonly provider: string

  constructor(provider: string) {
    super(`Unknown provider: ${provider}`)
    this.name = 'UnknownProviderError'
    this.provider = provider
  }
}

/**
 * Thrown by catalog-bound validation paths when a provider exists but the
 * selected model id does not belong to it.
 */
export class UnknownModelError extends Error {
  readonly provider: string
  readonly model: string

  constructor(provider: string, model: string) {
    super(`Unknown model "${model}" for provider "${provider}"`)
    this.name = 'UnknownModelError'
    this.provider = provider
    this.model = model
  }
}

/**
 * Thrown when a catalog-derived template such as an API URL references an
 * environment variable that is missing from the provided environment source.
 */
export class MissingTemplateVariableError extends Error {
  readonly variableName: string
  readonly template: string

  constructor(variableName: string, template: string) {
    super(`Missing template variable "${variableName}" while expanding "${template}"`)
    this.name = 'MissingTemplateVariableError'
    this.variableName = variableName
    this.template = template
  }
}

/**
 * Thrown when a provider package or subpath cannot be resolved from the chosen
 * installation root.
 */
export class MissingProviderPackageError extends Error {
  readonly packageName: string
  readonly specifier: string
  readonly installationRoot: string

  constructor(args: {
    packageName: string
    specifier: string
    installationRoot: string
    cause?: unknown
  }) {
    super(
      `Could not resolve "${args.specifier}" from installation root "${args.installationRoot}"`,
      args.cause ? { cause: args.cause } : undefined,
    )
    this.name = 'MissingProviderPackageError'
    this.packageName = args.packageName
    this.specifier = args.specifier
    this.installationRoot = args.installationRoot
  }
}

/**
 * Thrown when a resolved provider module does not expose the export required by
 * the adapter registry.
 */
export class InvalidProviderModuleError extends Error {
  readonly specifier: string
  readonly resolvedPath?: string
  readonly exportName: string

  constructor(args: { specifier: string; resolvedPath?: string; exportName: string }) {
    super(
      args.resolvedPath
        ? `Resolved module "${args.specifier}" at "${args.resolvedPath}" does not export "${args.exportName}"`
        : `Provider module "${args.specifier}" does not export "${args.exportName}"`,
    )
    this.name = 'InvalidProviderModuleError'
    this.specifier = args.specifier
    this.resolvedPath = args.resolvedPath
    this.exportName = args.exportName
  }
}

/**
 * Thrown when the handwritten adapter registry cannot describe how to load a
 * retained package or model family.
 */
export class AdapterConfigurationError extends Error {
  readonly adapterId: string

  constructor(adapterId: string, message: string) {
    super(message)
    this.name = 'AdapterConfigurationError'
    this.adapterId = adapterId
  }
}
