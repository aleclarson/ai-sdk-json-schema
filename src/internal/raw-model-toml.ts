import fs from 'node:fs'
import path from 'node:path'

interface RawModelProviderOverride {
  npm?: unknown
  api?: unknown
  shape?: unknown
}

export type RawModelToml = Record<string, unknown> & {
  extends?: {
    from?: unknown
    omit?: unknown
  }
  name?: unknown
  family?: unknown
  attachment?: unknown
  reasoning?: unknown
  tool_call?: unknown
  structured_output?: unknown
  temperature?: unknown
  knowledge?: unknown
  release_date?: unknown
  last_updated?: unknown
  modalities?: {
    input?: unknown
    output?: unknown
  }
  provider?: RawModelProviderOverride
}

export interface CreateRawModelResolverOptions {
  providersDir: string
  parseToml(source: string): unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getOptionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...value]
    : undefined
}

function parseModelRef(modelRef: string, label: string): { providerId: string; modelId: string } {
  const separatorIndex = modelRef.indexOf('/')

  if (separatorIndex <= 0 || separatorIndex === modelRef.length - 1) {
    throw new Error(`Expected ${label} to be a provider/model reference`)
  }

  return {
    providerId: modelRef.slice(0, separatorIndex),
    modelId: modelRef.slice(separatorIndex + 1),
  }
}

function mergeRawTomlObjects(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, cloneRawTomlValue(value)]),
  )

  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key]
    merged[key] =
      isRecord(baseValue) && isRecord(value)
        ? mergeRawTomlObjects(baseValue, value)
        : cloneRawTomlValue(value)
  }

  return merged
}

function cloneRawTomlValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value]
  }

  if (isRecord(value)) {
    return mergeRawTomlObjects(value, {})
  }

  return value
}

function withoutTopLevelExtends(rawModel: RawModelToml): Record<string, unknown> {
  const { extends: _extends, ...model } = rawModel
  return model
}

function isEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0
}

function omitRawTomlPath(model: Record<string, unknown>, dotPath: string, modelRef: string) {
  const pathSegments = dotPath.split('.').filter((segment) => segment.length > 0)

  if (pathSegments.length === 0) {
    throw new Error(`Expected ${modelRef}.extends.omit to contain non-empty dot paths`)
  }

  const ancestors: Array<{ container: Record<string, unknown>; key: string }> = []
  let container = model

  for (const key of pathSegments.slice(0, -1)) {
    if (!(key in container)) {
      throw new Error(`Model extends omit path "${dotPath}" was not found in "${modelRef}"`)
    }

    const value = container[key]

    if (!isRecord(value)) {
      throw new Error(`Model extends omit path "${dotPath}" was not found in "${modelRef}"`)
    }

    ancestors.push({ container, key })
    container = value
  }

  const omittedKey = pathSegments[pathSegments.length - 1]!

  if (!(omittedKey in container)) {
    throw new Error(`Model extends omit path "${dotPath}" was not found in "${modelRef}"`)
  }

  delete container[omittedKey]

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const { container: ancestorContainer, key } = ancestors[index]!

    if (!isEmptyRecord(ancestorContainer[key])) {
      break
    }

    delete ancestorContainer[key]
  }
}

function applyRawModelOmit(
  model: Record<string, unknown>,
  omitPaths: readonly string[] | undefined,
  modelRef: string,
) {
  for (const omitPath of omitPaths ?? []) {
    omitRawTomlPath(model, omitPath, modelRef)
  }
}

export function createRawModelResolver(options: CreateRawModelResolverOptions) {
  const resolvedModels = new Map<string, RawModelToml>()
  const resolvingModels = new Set<string>()

  function resolve(providerId: string, modelId: string): RawModelToml {
    const modelRef = `${providerId}/${modelId}`
    const cachedModel = resolvedModels.get(modelRef)

    if (cachedModel) {
      return cachedModel
    }

    if (resolvingModels.has(modelRef)) {
      throw new Error(
        `Circular model extends reference: ${[...resolvingModels, modelRef].join(' -> ')}`,
      )
    }

    resolvingModels.add(modelRef)

    try {
      const modelPath = path.join(options.providersDir, providerId, 'models', `${modelId}.toml`)

      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model extends reference "${modelRef}" was not found`)
      }

      const rawModel = options.parseToml(fs.readFileSync(modelPath, 'utf8')) as RawModelToml
      const baseModelRef = getOptionalString(rawModel.extends?.from)
      const baseModel = baseModelRef
        ? parseModelRef(baseModelRef, `${modelRef}.extends.from`)
        : undefined
      let resolvedModel: Record<string, unknown> = rawModel

      if (baseModel) {
        resolvedModel = mergeRawTomlObjects(
          resolve(baseModel.providerId, baseModel.modelId),
          withoutTopLevelExtends(rawModel),
        )
      }

      applyRawModelOmit(
        resolvedModel,
        baseModel ? getOptionalStringArray(rawModel.extends?.omit) : undefined,
        modelRef,
      )

      resolvedModels.set(modelRef, resolvedModel)
      return resolvedModel
    } finally {
      resolvingModels.delete(modelRef)
    }
  }

  return {
    resolve,
  }
}
