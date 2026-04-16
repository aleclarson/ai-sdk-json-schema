import fs from 'node:fs'
import path from 'node:path'

import {
  buildUnresolvedModelLoadPlan,
  getSupportedLoadModes,
  supportsPackageMode,
} from '../runtime/adapters'
import type { ModelDescriptor, ModelMode } from '../types'
import type {
  GeneratedTextCatalog,
  GeneratedTranscriptionCatalog,
  GeneratedTextModel,
  GeneratedTextProvider,
  GeneratedTranscriptionModel,
  GeneratedTranscriptionProvider,
  ModelShape,
} from './catalog-types'

export interface GenerateCatalogFromProvidersDirOptions {
  providersDir: string
  generatedAt: string
  ref: string
  since?: string
  parseToml(source: string): unknown
}

export interface GeneratedCatalogs {
  textModelCatalog: GeneratedTextCatalog
  transcriptionModelCatalog: GeneratedTranscriptionCatalog
}

export interface CollectListedPackageNamesFromProvidersDirOptions {
  providersDir: string
  parseToml(source: string): unknown
}

export interface GenerateCatalogsFromProvidersDirOptions
  extends Omit<GenerateCatalogFromProvidersDirOptions, 'since'> {
  textSince?: string
  transcriptionSince?: string
}

interface RawProviderToml {
  name?: unknown
  doc?: unknown
  env?: unknown
  npm?: unknown
  api?: unknown
  shape?: unknown
}

interface RawModelProviderOverride {
  npm?: unknown
  api?: unknown
  shape?: unknown
}

interface RawModelToml {
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

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string`)
  }

  return value
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected ${label} to be a boolean`)
  }

  return value
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Expected ${label} to be an array of strings`)
  }

  return [...value]
}

function getOptionalShape(value: unknown): ModelShape | undefined {
  return value === 'completions' || value === 'responses' ? value : undefined
}

function assertSinceDateString(value: unknown, label: string): string {
  const date = assertString(value, label)

  if (!ISO_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new Error(`Expected ${label} to be a valid YYYY-MM-DD date`)
  }

  return date
}

function normalizeComparableDate(date: string): string | undefined {
  const dayMatch = /^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(date)

  if (dayMatch) {
    return dayMatch[1]
  }

  const monthMatch = /^(\d{4}-\d{2})$/.exec(date)

  if (monthMatch) {
    return `${monthMatch[1]}-01`
  }

  const yearMatch = /^(\d{4})$/.exec(date)

  if (yearMatch) {
    return `${yearMatch[1]}-01-01`
  }

  return undefined
}

function isModelIncludedSince(model: GeneratedTextModel, since: string | undefined): boolean {
  if (since === undefined) {
    return true
  }

  const comparableReleaseDate = normalizeComparableDate(model.releaseDate)

  if (comparableReleaseDate !== undefined && comparableReleaseDate >= since) {
    return true
  }

  const comparableLastUpdated = normalizeComparableDate(model.lastUpdated)
  return comparableLastUpdated !== undefined && comparableLastUpdated >= since
}

function assertSupportedPackageName(packageName: string, label: string, mode: ModelMode) {
  if (!supportsPackageMode(packageName, mode)) {
    throw new Error(`${label} uses unsupported ${mode} package "${packageName}"`)
  }
}

function createDescriptor(
  mode: ModelMode,
  provider: GeneratedTextProvider | GeneratedTranscriptionProvider,
  model: GeneratedTextModel | GeneratedTranscriptionModel,
): ModelDescriptor {
  if (mode === 'transcription') {
    return {
      mode,
      provider: provider.id,
      providerName: provider.name,
      providerDoc: provider.doc,
      env: provider.env,
      catalogMatch: true,
      model: model.id,
      name: model.name,
      supportedLoadModes: getSupportedLoadModes(model.packageName),
      packageName: model.packageName,
      api: model.api,
    }
  }

  const textModel = model as GeneratedTextModel

  return {
    mode,
    provider: provider.id,
    providerName: provider.name,
    providerDoc: provider.doc,
    env: provider.env,
    catalogMatch: true,
    model: textModel.id,
    name: textModel.name,
    supportedLoadModes: getSupportedLoadModes(textModel.packageName),
    family: textModel.family,
    attachment: textModel.attachment,
    reasoning: textModel.reasoning,
    toolCall: textModel.toolCall,
    structuredOutput: textModel.structuredOutput,
    temperature: textModel.temperature,
    knowledge: textModel.knowledge,
    releaseDate: textModel.releaseDate,
    lastUpdated: textModel.lastUpdated,
    modalities: textModel.modalities,
    packageName: textModel.packageName,
    api: textModel.api,
    shape: textModel.shape,
  }
}

function validateModelAdapter(
  mode: ModelMode,
  provider: GeneratedTextProvider | GeneratedTranscriptionProvider,
  model: GeneratedTextModel | GeneratedTranscriptionModel,
) {
  buildUnresolvedModelLoadPlan(mode, createDescriptor(mode, provider, model), undefined)
}

function listProviderDirectories(providersDir: string): string[] {
  return fs
    .readdirSync(providersDir, {
      withFileTypes: true,
    })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function listModelTomlFiles(modelsDir: string): string[] {
  const files: string[] = []
  const queue = ['']

  while (queue.length > 0) {
    const relativeDir = queue.shift()!
    const absoluteDir = path.join(modelsDir, relativeDir)

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name)

      if (entry.isDirectory()) {
        queue.push(relativePath)
        continue
      }

      if (entry.isFile() && entry.name.endsWith('.toml')) {
        files.push(relativePath)
      }
    }
  }

  return files.sort()
}

function normalizeModelId(relativePath: string): string {
  return relativePath.replaceAll(path.sep, '/').replace(/\.toml$/, '')
}

function createModel(
  providerId: string,
  modelId: string,
  rawModel: RawModelToml,
  defaultPackageName: string,
  defaultApi: string | undefined,
): GeneratedTextModel | undefined {
  const inputModalities = assertStringArray(
    rawModel.modalities?.input,
    `${providerId}/${modelId}.modalities.input`,
  )
  const outputModalities = assertStringArray(
    rawModel.modalities?.output,
    `${providerId}/${modelId}.modalities.output`,
  )

  if (!outputModalities.includes('text')) {
    return undefined
  }

  const packageName = getOptionalString(rawModel.provider?.npm) ?? defaultPackageName
  const api = getOptionalString(rawModel.provider?.api) ?? defaultApi
  const shape = getOptionalShape(rawModel.provider?.shape)

  return {
    id: modelId,
    name: assertString(rawModel.name, `${providerId}/${modelId}.name`),
    family: getOptionalString(rawModel.family),
    attachment: assertBoolean(rawModel.attachment, `${providerId}/${modelId}.attachment`),
    reasoning: assertBoolean(rawModel.reasoning, `${providerId}/${modelId}.reasoning`),
    toolCall: assertBoolean(rawModel.tool_call, `${providerId}/${modelId}.tool_call`),
    structuredOutput: getOptionalBoolean(rawModel.structured_output),
    temperature: getOptionalBoolean(rawModel.temperature),
    knowledge: getOptionalString(rawModel.knowledge),
    releaseDate: assertString(rawModel.release_date, `${providerId}/${modelId}.release_date`),
    lastUpdated: assertString(rawModel.last_updated, `${providerId}/${modelId}.last_updated`),
    modalities: {
      input: inputModalities,
      output: outputModalities,
    },
    packageName,
    api,
    shape,
  }
}

function isModelIncludedForMode(mode: ModelMode, model: GeneratedTextModel): boolean {
  if (mode === 'text') {
    return true
  }

  return model.modalities.input.includes('audio') && model.modalities.output.includes('text')
}

function createTranscriptionModel(model: GeneratedTextModel): GeneratedTranscriptionModel {
  return {
    id: model.id,
    name: model.name,
    packageName: model.packageName,
    api: model.api,
    supportedLoadModes: getSupportedLoadModes(model.packageName),
  }
}

export function collectListedPackageNamesFromProvidersDir(
  options: CollectListedPackageNamesFromProvidersDirOptions,
): string[] {
  const packageNames = new Set<string>()

  for (const providerId of listProviderDirectories(options.providersDir)) {
    const providerDir = path.join(options.providersDir, providerId)
    const providerTomlPath = path.join(providerDir, 'provider.toml')
    const modelsDir = path.join(providerDir, 'models')

    if (!fs.existsSync(providerTomlPath) || !fs.existsSync(modelsDir)) {
      continue
    }

    const rawProvider = options.parseToml(
      fs.readFileSync(providerTomlPath, 'utf8'),
    ) as RawProviderToml
    packageNames.add(assertString(rawProvider.npm, `${providerId}.provider.npm`))

    for (const relativePath of listModelTomlFiles(modelsDir)) {
      const rawModel = options.parseToml(
        fs.readFileSync(path.join(modelsDir, relativePath), 'utf8'),
      ) as RawModelToml
      const overridePackageName = getOptionalString(rawModel.provider?.npm)

      if (overridePackageName) {
        packageNames.add(overridePackageName)
      }
    }
  }

  return [...packageNames].sort()
}

export function createGeneratedCatalogFromProvidersDir(
  options: GenerateCatalogFromProvidersDirOptions,
): GeneratedTextCatalog
export function createGeneratedCatalogFromProvidersDir(
  options: GenerateCatalogFromProvidersDirOptions,
  mode: 'text',
): GeneratedTextCatalog
export function createGeneratedCatalogFromProvidersDir(
  options: GenerateCatalogFromProvidersDirOptions,
  mode: 'transcription',
): GeneratedTranscriptionCatalog
export function createGeneratedCatalogFromProvidersDir(
  options: GenerateCatalogFromProvidersDirOptions,
  mode: ModelMode = 'text',
): GeneratedTextCatalog | GeneratedTranscriptionCatalog {
  const since = options.since ? assertSinceDateString(options.since, 'since') : undefined
  const packageNames = new Set<string>()
  const providers:
    | Record<string, GeneratedTextProvider>
    | Record<string, GeneratedTranscriptionProvider> = {}

  for (const providerId of listProviderDirectories(options.providersDir)) {
    const providerDir = path.join(options.providersDir, providerId)
    const providerTomlPath = path.join(providerDir, 'provider.toml')
    const modelsDir = path.join(providerDir, 'models')

    if (!fs.existsSync(providerTomlPath) || !fs.existsSync(modelsDir)) {
      continue
    }

    const rawProvider = options.parseToml(
      fs.readFileSync(providerTomlPath, 'utf8'),
    ) as RawProviderToml
    const defaultPackageName = assertString(rawProvider.npm, `${providerId}.provider.npm`)
    const defaultSupportedLoadModes = getSupportedLoadModes(defaultPackageName)

    if (mode === 'text' && !defaultSupportedLoadModes.includes('text')) {
      assertSupportedPackageName(defaultPackageName, `Provider "${providerId}"`, mode)
      continue
    }

    const providerName = assertString(rawProvider.name, `${providerId}.provider.name`)
    const providerDoc = assertString(rawProvider.doc, `${providerId}.provider.doc`)
    const providerEnv = assertStringArray(rawProvider.env, `${providerId}.provider.env`)
    const providerApi = getOptionalString(rawProvider.api)
    const providerShape = getOptionalShape(rawProvider.shape)
    const provider =
      mode === 'text'
        ? ({
            id: providerId,
            name: providerName,
            doc: providerDoc,
            env: providerEnv,
            packageName: defaultPackageName,
            api: providerApi,
            shape: providerShape,
            models: {},
          } satisfies GeneratedTextProvider)
        : ({
            id: providerId,
            name: providerName,
            doc: providerDoc,
            env: providerEnv,
            packageName: defaultPackageName,
            api: providerApi,
            models: {},
          } satisfies GeneratedTranscriptionProvider)
    const defaultApi = provider.api

    for (const relativePath of listModelTomlFiles(modelsDir)) {
      const modelId = normalizeModelId(relativePath)
      const rawModel = options.parseToml(
        fs.readFileSync(path.join(modelsDir, relativePath), 'utf8'),
      ) as RawModelToml

      const model = createModel(providerId, modelId, rawModel, defaultPackageName, defaultApi)

      if (!model) {
        continue
      }

      if (!isModelIncludedForMode(mode, model) || !isModelIncludedSince(model, since)) {
        continue
      }

      if (mode === 'text') {
        if (!supportsPackageMode(model.packageName, mode)) {
          assertSupportedPackageName(model.packageName, `Model "${providerId}/${modelId}"`, mode)
          continue
        }

        validateModelAdapter(mode, provider, model)
        ;(provider as GeneratedTextProvider).models[modelId] = model
        packageNames.add(model.packageName)
      } else {
        const transcriptionModel = createTranscriptionModel(model)

        if (transcriptionModel.supportedLoadModes.length === 0) {
          continue
        }

        ;(provider as GeneratedTranscriptionProvider).models[modelId] = transcriptionModel
        packageNames.add(model.packageName)
      }
    }

    if (mode === 'text') {
      packageNames.add(provider.packageName)
      providers[providerId] = provider
      continue
    }

    if (
      defaultSupportedLoadModes.length > 0 ||
      Object.keys((provider as GeneratedTranscriptionProvider).models).length > 0
    ) {
      if (defaultSupportedLoadModes.length > 0) {
        packageNames.add(provider.packageName)
      }

      providers[providerId] = provider
    }
  }

  return {
    source: {
      repo: 'anomalyco/models.dev',
      ref: options.ref,
      generatedAt: options.generatedAt,
    },
    packageNames: [...packageNames].sort(),
    providers: Object.fromEntries(
      Object.entries(providers).sort(([left], [right]) => left.localeCompare(right)),
    ),
  }
}

export function createGeneratedCatalogsFromProvidersDir(
  options: GenerateCatalogsFromProvidersDirOptions,
): GeneratedCatalogs {
  return {
    textModelCatalog: createGeneratedCatalogFromProvidersDir(
      {
        ...options,
        since: options.textSince,
      },
      'text',
    ),
    transcriptionModelCatalog: createGeneratedCatalogFromProvidersDir(
      {
        ...options,
        since: options.transcriptionSince,
      },
      'transcription',
    ),
  }
}

export function renderCatalogModule(
  catalog: GeneratedTextCatalog | GeneratedTranscriptionCatalog,
  options: { exportName: string; typeName: string; filterComment?: string },
): string {
  const description =
    options.exportName === 'textModelCatalog'
      ? [
          '/**',
          ' * Generated text-model catalog derived from `anomalyco/models.dev`.',
          ' *',
          ' * The catalog is committed to the repository and contains only models whose',
          ' * declared output modalities include `text`.',
          ' */',
        ]
      : [
          '/**',
          ' * Generated transcription-model catalog derived from `anomalyco/models.dev`.',
          ' *',
          ' * The catalog is committed to the repository and contains only models whose',
          ' * declared input modalities include `audio`, whose output modalities include',
          ' * `text`, and whose package supports at least one runtime load mode in this',
          ' * library.',
          ' */',
        ]

  return [
    '// GENERATED FILE. DO NOT EDIT.',
    '// Generated by: scripts/generate.ts',
    '// Regenerate with: pnpm generate',
    ...(options.filterComment ? [`// Filtered with: ${options.filterComment}`, ''] : []),
    '',
    `import type { ${options.typeName} } from '../internal/catalog-types'`,
    '',
    ...description,
    `export const ${options.exportName}: ${options.typeName} = ` + JSON.stringify(catalog, null, 2),
    '',
  ].join('\n')
}
