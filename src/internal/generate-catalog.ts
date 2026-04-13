import fs from 'node:fs'
import path from 'node:path'

import { buildUnresolvedTextModelLoadPlan, SUPPORTED_PACKAGE_NAMES } from '../runtime/adapters'
import type {
  GeneratedCatalog,
  GeneratedTextModel,
  GeneratedTextProvider,
  ModelShape,
} from './catalog-types'

export interface GenerateCatalogFromProvidersDirOptions {
  providersDir: string
  generatedAt: string
  ref: string
  since?: string
  parseToml(source: string): unknown
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

function assertSupportedPackageName(packageName: string, label: string) {
  if (!SUPPORTED_PACKAGE_NAMES.includes(packageName)) {
    throw new Error(`${label} uses unsupported package "${packageName}"`)
  }
}

function validateModelAdapter(provider: GeneratedTextProvider, model: GeneratedTextModel) {
  buildUnresolvedTextModelLoadPlan(
    {
      provider: provider.id,
      providerName: provider.name,
      providerDoc: provider.doc,
      env: provider.env,
      catalogMatch: true,
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
    },
    undefined,
  )
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
  provider: GeneratedTextProvider,
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

  const model: GeneratedTextModel = {
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

  return model
}

export function createGeneratedCatalogFromProvidersDir(
  options: GenerateCatalogFromProvidersDirOptions,
): GeneratedCatalog {
  const since = options.since ? assertSinceDateString(options.since, 'since') : undefined
  const packageNames = new Set<string>()
  const providers: Record<string, GeneratedTextProvider> = {}

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

    assertSupportedPackageName(defaultPackageName, `Provider "${providerId}"`)

    const provider: GeneratedTextProvider = {
      id: providerId,
      name: assertString(rawProvider.name, `${providerId}.provider.name`),
      doc: assertString(rawProvider.doc, `${providerId}.provider.doc`),
      env: assertStringArray(rawProvider.env, `${providerId}.provider.env`),
      packageName: defaultPackageName,
      api: getOptionalString(rawProvider.api),
      shape: getOptionalShape(rawProvider.shape),
      models: {},
    }
    const defaultApi = provider.api

    packageNames.add(provider.packageName)

    for (const relativePath of listModelTomlFiles(modelsDir)) {
      const modelId = normalizeModelId(relativePath)
      const rawModel = options.parseToml(
        fs.readFileSync(path.join(modelsDir, relativePath), 'utf8'),
      ) as RawModelToml

      const model = createModel(
        providerId,
        provider,
        modelId,
        rawModel,
        defaultPackageName,
        defaultApi,
      )

      if (!model) {
        continue
      }

      if (!isModelIncludedSince(model, since)) {
        continue
      }

      assertSupportedPackageName(model.packageName, `Model "${providerId}/${modelId}"`)
      validateModelAdapter(provider, model)

      provider.models[modelId] = model
      packageNames.add(model.packageName)
    }

    providers[providerId] = provider
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

export function renderCatalogModule(
  catalog: GeneratedCatalog,
  options: { since?: string } = {},
): string {
  return [
    '// GENERATED FILE. DO NOT EDIT.',
    '// Generated by: scripts/generate.ts',
    '// Regenerate with: pnpm generate',
    ...(options.since ? [`// Filtered with: --since ${options.since}`, ''] : []),
    '',
    "import type { GeneratedCatalog } from '../internal/catalog-types'",
    '',
    'export const generatedCatalog: GeneratedCatalog = ' + JSON.stringify(catalog, null, 2),
    '',
  ].join('\n')
}
