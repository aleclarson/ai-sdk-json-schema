// @ts-nocheck

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { $ } from 'bun'

import {
  collectListedPackageNamesFromProvidersDir,
  createGeneratedCatalogsFromProvidersDir,
  renderCatalogModule,
} from '../src/internal/generate-catalog'

const OWNER = 'anomalyco'
const REPO = 'models.dev'
const DEFAULT_TEXT_MONTHS = 8
const DEFAULT_TRANSCRIPTION_MONTHS = 24
const NON_CALLABLE_PACKAGE_NAMES = new Set(['ai-gateway-provider'])
const CREATE_EXPORT_NAME_BY_PACKAGE = {
  '@ai-sdk/alibaba': 'createAlibaba',
  '@ai-sdk/amazon-bedrock': 'createAmazonBedrock',
  '@ai-sdk/anthropic': 'createAnthropic',
  '@ai-sdk/azure': 'createAzure',
  '@ai-sdk/cerebras': 'createCerebras',
  '@ai-sdk/cohere': 'createCohere',
  '@ai-sdk/deepinfra': 'createDeepInfra',
  '@ai-sdk/gateway': 'createGateway',
  '@ai-sdk/google': 'createGoogleGenerativeAI',
  '@ai-sdk/google-vertex': 'createVertex',
  '@ai-sdk/google-vertex/anthropic': 'createVertexAnthropic',
  '@ai-sdk/groq': 'createGroq',
  '@ai-sdk/mistral': 'createMistral',
  '@ai-sdk/openai': 'createOpenAI',
  '@ai-sdk/openai-compatible': 'createOpenAICompatible',
  '@ai-sdk/perplexity': 'createPerplexity',
  '@ai-sdk/togetherai': 'createTogetherAI',
  '@ai-sdk/vercel': 'createVercel',
  '@ai-sdk/xai': 'createXai',
  '@aihubmix/ai-sdk-provider': 'createAihubmix',
  '@jerome-benoit/sap-ai-provider-v2': 'createSAPAIProvider',
  '@openrouter/ai-sdk-provider': 'createOpenRouter',
  'gitlab-ai-provider': 'createGitLab',
  'venice-ai-sdk-provider': 'createVenice',
} as const

interface GeneratedCallableAdapterConfig {
  id: string
  createExportName: string
  supportsTranscription: boolean
}

interface PackageSpecifierParts {
  rootPackageName: string
  subpath?: string
}

function formatDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function subtractMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const absoluteMonth = year * 12 + month - months
  const nextAbsoluteMonth = absoluteMonth + 1
  const targetYear = Math.floor(absoluteMonth / 12)
  const targetMonth = ((absoluteMonth % 12) + 12) % 12
  const nextYear = Math.floor(nextAbsoluteMonth / 12)
  const nextMonth = ((nextAbsoluteMonth % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDayOfTargetMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

function getDefaultSinceDate(months: number, now: Date): string {
  return formatDateUtc(subtractMonthsUtc(now, months))
}

function normalizeDeclarationPath(pathname: string): string {
  return pathname.replace(/^\.\//, '')
}

function splitPackageSpecifier(specifier: string): PackageSpecifierParts {
  const parts = specifier.split('/')

  if (specifier.startsWith('@')) {
    const rootPackageName = parts.slice(0, 2).join('/')
    const subpath = parts.slice(2).join('/')

    return {
      rootPackageName,
      subpath: subpath || undefined,
    }
  }

  return {
    rootPackageName: parts[0]!,
    subpath: parts.slice(1).join('/') || undefined,
  }
}

function getDefaultDeclarationPath(specifier: string): string {
  const { subpath } = splitPackageSpecifier(specifier)
  return subpath ? `dist/${subpath}/index.d.mts` : 'dist/index.d.mts'
}

function getUnpkgDeclarationUrl(specifier: string, declarationPath: string): string {
  const { rootPackageName } = splitPackageSpecifier(specifier)
  return `https://unpkg.com/${rootPackageName}/${declarationPath}`
}

async function fetchUnpkgDeclarationSource(
  specifier: string,
  declarationPath: string,
): Promise<string | undefined> {
  const response = await fetch(getUnpkgDeclarationUrl(specifier, declarationPath))

  if (!response.ok) {
    return undefined
  }

  return response.text()
}

async function fetchPackageDeclarationPath(packageName: string): Promise<string | undefined> {
  const { rootPackageName, subpath } = splitPackageSpecifier(packageName)
  const response = await fetch(`https://unpkg.com/${rootPackageName}/package.json`)

  if (!response.ok) {
    throw new Error(`Failed to fetch package.json for ${packageName}: ${response.status}`)
  }

  const pkg = await response.json()
  const exportKey = subpath ? `./${subpath}` : '.'
  const typesPath =
    typeof pkg?.exports?.[exportKey]?.types === 'string'
      ? pkg.exports[exportKey].types
      : !subpath && typeof pkg?.types === 'string'
        ? pkg.types
        : undefined

  return typesPath ? normalizeDeclarationPath(typesPath) : undefined
}

async function fetchDeclarationPageForPackage(packageName: string): Promise<string> {
  const defaultDeclarationPath = getDefaultDeclarationPath(packageName)
  const defaultPage = await fetchUnpkgDeclarationSource(packageName, defaultDeclarationPath)

  if (defaultPage !== undefined) {
    return defaultPage
  }

  const fallbackDeclarationPath = await fetchPackageDeclarationPath(packageName)

  if (!fallbackDeclarationPath || fallbackDeclarationPath === defaultDeclarationPath) {
    throw new Error(
      `Failed to fetch ${getUnpkgDeclarationUrl(packageName, defaultDeclarationPath)} and no fallback types path was found`,
    )
  }

  const fallbackPage = await fetchUnpkgDeclarationSource(packageName, fallbackDeclarationPath)

  if (fallbackPage === undefined) {
    throw new Error(
      `Failed to fetch ${getUnpkgDeclarationUrl(packageName, fallbackDeclarationPath)} for ${packageName}`,
    )
  }

  return fallbackPage
}

async function generateCallableAdapterConfigs(
  packageNames: readonly string[],
): Promise<GeneratedCallableAdapterConfig[]> {
  return Promise.all(
    packageNames
      .filter((packageName) => !NON_CALLABLE_PACKAGE_NAMES.has(packageName))
      .sort()
      .map(async (packageName) => {
        const createExportName = CREATE_EXPORT_NAME_BY_PACKAGE[packageName]

        if (!createExportName) {
          throw new Error(
            `No generated callable adapter export name is configured for package "${packageName}"`,
          )
        }

        const declarationPage = await fetchDeclarationPageForPackage(packageName)

        return {
          id: packageName,
          createExportName,
          supportsTranscription: declarationPage.toLowerCase().includes('transcription'),
        }
      }),
  )
}

function renderCallableAdapterModule(configs: readonly GeneratedCallableAdapterConfig[]): string {
  return [
    '// GENERATED FILE. DO NOT EDIT.',
    '// Generated by: scripts/generate.ts',
    '// Regenerate with: pnpm generate',
    '',
    '/**',
    ' * Generated callable-adapter metadata derived from provider-listed package names',
    ' * in `anomalyco/models.dev`.',
    ' *',
    ' * Transcription support is detected by fetching the raw package declaration',
    ' * source from `unpkg.com/.../dist/index.d.mts` and checking for the',
    ' * `transcription` substring in the response body.',
    ' */',
    'export const generatedCallableAdapterConfigs = ' + JSON.stringify(configs, null, 2) + ' as const',
    '',
  ].join('\n')
}

function parseArgs(argv: string[]) {
  let textSince: string | undefined
  let transcriptionSince: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!

    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: bun scripts/generate.ts [--since YYYY-MM-DD] [--text-since YYYY-MM-DD] [--transcription-since YYYY-MM-DD]',
      )
      process.exit(0)
    }

    if (arg === '--since') {
      const value = argv[index + 1]

      if (!value) {
        throw new Error('Missing value for --since')
      }

      textSince = value
      transcriptionSince = value
      index += 1
      continue
    }

    if (arg.startsWith('--since=')) {
      const value = arg.slice('--since='.length)
      textSince = value
      transcriptionSince = value
      continue
    }

    if (arg === '--text-since') {
      textSince = argv[index + 1]

      if (!textSince) {
        throw new Error('Missing value for --text-since')
      }

      index += 1
      continue
    }

    if (arg.startsWith('--text-since=')) {
      textSince = arg.slice('--text-since='.length)
      continue
    }

    if (arg === '--transcription-since') {
      transcriptionSince = argv[index + 1]

      if (!transcriptionSince) {
        throw new Error('Missing value for --transcription-since')
      }

      index += 1
      continue
    }

    if (arg.startsWith('--transcription-since=')) {
      transcriptionSince = arg.slice('--transcription-since='.length)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  const now = new Date()

  return {
    textSince: textSince ?? getDefaultSinceDate(DEFAULT_TEXT_MONTHS, now),
    transcriptionSince:
      transcriptionSince ?? getDefaultSinceDate(DEFAULT_TRANSCRIPTION_MONTHS, now),
  }
}

async function main() {
  const { textSince, transcriptionSince } = parseArgs(process.argv.slice(2))
  const repoResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`)

  if (!repoResponse.ok) {
    throw new Error(`Failed to fetch repo metadata: ${repoResponse.status}`)
  }

  const repo = await repoResponse.json()
  const ref = repo.default_branch ?? 'dev'
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'models-dev-'))

  try {
    const archiveUrl = `https://codeload.github.com/${OWNER}/${REPO}/tar.gz/refs/heads/${ref}`

    await $`curl -L --silent ${archiveUrl} | tar -xzf - -C ${tempDir}`

    const [archiveRoot] = await fs.readdir(tempDir)

    if (!archiveRoot) {
      throw new Error('Downloaded archive was empty')
    }

    const catalogs = createGeneratedCatalogsFromProvidersDir({
      providersDir: path.join(tempDir, archiveRoot, 'providers'),
      generatedAt: new Date().toISOString(),
      ref,
      textSince,
      transcriptionSince,
      parseToml(source) {
        return Bun.TOML.parse(source)
      },
    })
    const listedPackageNames = collectListedPackageNamesFromProvidersDir({
      providersDir: path.join(tempDir, archiveRoot, 'providers'),
      parseToml(source) {
        return Bun.TOML.parse(source)
      },
    })
    const callableAdapterConfigs = await generateCallableAdapterConfigs(listedPackageNames)

    const generatedDir = path.join(import.meta.dir, '..', 'src', 'generated')

    await fs.writeFile(
      path.join(generatedDir, 'callable-adapters.ts'),
      renderCallableAdapterModule(callableAdapterConfigs),
    )
    await fs.writeFile(
      path.join(generatedDir, 'text-model-catalog.ts'),
      renderCatalogModule(catalogs.textModelCatalog, {
        exportName: 'textModelCatalog',
        typeName: 'GeneratedTextCatalog',
        filterComment: `--text-since ${textSince}`,
      }),
    )
    await fs.writeFile(
      path.join(generatedDir, 'transcription-model-catalog.ts'),
      renderCatalogModule(catalogs.transcriptionModelCatalog, {
        exportName: 'transcriptionModelCatalog',
        typeName: 'GeneratedTranscriptionCatalog',
        filterComment: `--transcription-since ${transcriptionSince}`,
      }),
    )

    console.log(
      `Generated ${callableAdapterConfigs.length} callable adapter configs, ${Object.keys(catalogs.textModelCatalog.providers).length} text providers, ${catalogs.textModelCatalog.packageNames.length} text package identifiers since ${textSince}, ${Object.keys(catalogs.transcriptionModelCatalog.providers).length} transcription providers, and ${catalogs.transcriptionModelCatalog.packageNames.length} transcription package identifiers since ${transcriptionSince} from ${OWNER}/${REPO}@${ref}`,
    )
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    })
  }
}

await main()
