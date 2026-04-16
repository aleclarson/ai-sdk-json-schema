import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { textModelCatalog } from '../src/generated/text-model-catalog'
import { transcriptionModelCatalog } from '../src/generated/transcription-model-catalog'
import {
  AdapterConfigurationError,
  MissingProviderPackageError,
  MissingTemplateVariableError,
} from '../src/errors'
import type { GeneratedCatalog, GeneratedCatalogProviderBase } from '../src/internal/catalog-types'
import { createModelDescriptor } from '../src/internal/resolve-descriptor'
import {
  buildModelLoadPlan,
  executeModelLoadPlan,
  loadTextModel,
  loadTranscriptionModel,
  resolveModel,
  resolveModelModules,
} from '../src/index'

const workspaceRoot = path.resolve(import.meta.dir, '..')

type RuntimeCatalog = GeneratedCatalog<
  GeneratedCatalogProviderBase<{
    packageName: string
    api?: string
    supportedLoadModes?: readonly string[]
  }>
>

function findConfig(
  catalog: RuntimeCatalog,
  predicate: (entry: {
    providerId: string
    modelId: string
    packageName: string
    api?: string
    supportedLoadModes?: readonly string[]
  }) => boolean,
) {
  for (const [providerId, provider] of Object.entries(catalog.providers)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (
        predicate({
          providerId,
          modelId,
          packageName: model.packageName,
          api: model.api,
          supportedLoadModes: model.supportedLoadModes,
        })
      ) {
        return {
          provider: providerId,
          model: modelId,
        }
      }
    }
  }

  throw new Error('No matching model found in catalog')
}

function getPlanFactoryOptions(plan: ReturnType<typeof buildModelLoadPlan>) {
  const createProviderOperation = plan.operations.find(
    (operation) => operation.kind === 'create-binding' && operation.binding === 'provider',
  )

  if (!createProviderOperation || createProviderOperation.kind !== 'create-binding') {
    return undefined
  }

  return createProviderOperation.options
}

describe('runtime planning', () => {
  test('returns runtime metadata from resolveModel for text mode', () => {
    const config = findConfig(textModelCatalog, ({ packageName }) => packageName === '@ai-sdk/openai')
    const descriptor = resolveModel('text', config)

    expect(descriptor.mode).toBe('text')
    expect(descriptor.catalogMatch).toBe(true)
    expect(descriptor.provider).toBe(config.provider)
    expect(descriptor.model).toBe(config.model)
    expect(descriptor.packageName).toBe('@ai-sdk/openai')
    expect(descriptor.supportedLoadModes).toEqual(['text', 'transcription'])
  })

  test('returns runtime metadata from resolveModel for transcription mode', () => {
    const config = findConfig(
      transcriptionModelCatalog,
      ({ packageName }) => packageName === '@ai-sdk/openai',
    )
    const descriptor = resolveModel('transcription', config)

    expect(descriptor.mode).toBe('transcription')
    expect(descriptor.catalogMatch).toBe(true)
    expect(descriptor.provider).toBe(config.provider)
    expect(descriptor.model).toBe(config.model)
    expect(descriptor.packageName).toBe('@ai-sdk/openai')
    expect(descriptor.supportedLoadModes).toEqual(['text', 'transcription'])
  })

  test('builds an unresolved text plan and accepts unknown model ids', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-next-preview',
    }
    const descriptor = resolveModel('text', config)
    const plan = buildModelLoadPlan('text', config)

    expect(descriptor.catalogMatch).toBe(false)
    expect(descriptor.name).toBe('gpt-next-preview')
    expect(descriptor.packageName).toBe('@ai-sdk/openai')
    expect(descriptor.supportedLoadModes).toEqual(['text', 'transcription'])
    expect(plan.stage).toBe('unresolved')
    expect(plan.mode).toBe('text')
    expect(plan.descriptor.model).toBe('gpt-next-preview')
    expect(plan.modules.length).toBeGreaterThan(0)
    expect('resolvedPath' in plan.modules[0]!).toBe(false)
  })

  test('builds an unresolved transcription plan', () => {
    const config = findConfig(
      transcriptionModelCatalog,
      ({ packageName }) => packageName === '@ai-sdk/openai',
    )
    const plan = buildModelLoadPlan('transcription', config)

    expect(plan.stage).toBe('unresolved')
    expect(plan.mode).toBe('transcription')
    expect(plan.descriptor.mode).toBe('transcription')
    expect(plan.modules.length).toBeGreaterThan(0)
  })

  test('returns fallback capability metadata for a text-only transcription entry', () => {
    const config = findConfig(
      transcriptionModelCatalog,
      ({ supportedLoadModes }) =>
        supportedLoadModes?.includes('text') === true &&
        supportedLoadModes?.includes('transcription') !== true,
    )
    const descriptor = resolveModel('transcription', config)

    expect(descriptor.mode).toBe('transcription')
    expect(descriptor.supportedLoadModes).toEqual(['text'])
  })

  test('uses provider default capability metadata for unknown transcription model ids', () => {
    const knownConfig = findConfig(
      transcriptionModelCatalog,
      ({ supportedLoadModes }) =>
        supportedLoadModes?.includes('text') === true &&
        supportedLoadModes?.includes('transcription') !== true,
    )
    const descriptor = resolveModel('transcription', {
      provider: knownConfig.provider,
      model: 'future-audio-model-id',
    })

    expect(descriptor.catalogMatch).toBe(false)
    expect(descriptor.supportedLoadModes).toEqual(['text'])
  })

  test('fails transcription planning for text-only entries', () => {
    const config = findConfig(
      transcriptionModelCatalog,
      ({ supportedLoadModes }) =>
        supportedLoadModes?.includes('text') === true &&
        supportedLoadModes?.includes('transcription') !== true,
    )

    expect(() => buildModelLoadPlan('transcription', config)).toThrow(
      new RegExp('No transcription adapter is configured'),
    )
  })

  test('text resolution ignores transcription-only model metadata', () => {
    const descriptor = createModelDescriptor(
      {
        textModelCatalog: {
          source: {
            repo: 'fixture/repo',
            ref: 'fixture-ref',
            generatedAt: '2026-04-16T00:00:00.000Z',
          },
          packageNames: ['@ai-sdk/openai-compatible'],
          providers: {
            demo: {
              id: 'demo',
              name: 'Demo',
              doc: 'https://example.com/demo',
              env: ['DEMO_API_KEY'],
              packageName: '@ai-sdk/openai-compatible',
              api: 'https://provider-default.example/v1',
              models: {},
            },
          },
        },
        transcriptionModelCatalog: {
          source: {
            repo: 'fixture/repo',
            ref: 'fixture-ref',
            generatedAt: '2026-04-16T00:00:00.000Z',
          },
          packageNames: ['@ai-sdk/google', '@ai-sdk/openai-compatible'],
          providers: {
            demo: {
              id: 'demo',
              name: 'Demo',
              doc: 'https://example.com/demo',
              env: ['DEMO_API_KEY'],
              packageName: '@ai-sdk/openai-compatible',
              api: 'https://provider-default.example/v1',
              models: {
                'audio-override': {
                  id: 'audio-override',
                  name: 'Audio Override',
                  packageName: '@ai-sdk/google',
                  api: 'https://model-override.example/v1',
                  supportedLoadModes: ['text'],
                },
              },
            },
          },
        },
      },
      'text',
      {
        provider: 'demo',
        model: 'audio-override',
      },
    )

    expect(descriptor.mode).toBe('text')
    expect(descriptor.catalogMatch).toBe(false)
    expect(descriptor.name).toBe('audio-override')
    expect(descriptor.packageName).toBe('@ai-sdk/openai-compatible')
    expect(descriptor.api).toBe('https://provider-default.example/v1')
    expect(descriptor.shape).toBeUndefined()
    expect(descriptor.supportedLoadModes).toEqual(['text'])
  })

  test('interpolates API templates and fails on missing env variables', () => {
    const config = findConfig(textModelCatalog, ({ api }) => typeof api === 'string' && api.includes('${'))
    const descriptor = resolveModel('text', config)
    const variableNames = [...(descriptor.api ?? '').matchAll(/\$\{([A-Z0-9_]+)\}/g)].map(
      (match) => match[1]!,
    )
    const env = Object.fromEntries(
      variableNames.map((name) => [name, `${name.toLowerCase()}-value`]),
    )

    const plan = buildModelLoadPlan('text', config, {
      env,
    })
    const options = getPlanFactoryOptions(plan)

    expect(JSON.stringify(options)).not.toContain('${')

    expect(() =>
      buildModelLoadPlan('text', config, {
        env: {},
      }),
    ).toThrow(MissingTemplateVariableError)
  })

  test('resolves module plans relative to installationRoot', () => {
    const config = findConfig(
      textModelCatalog,
      ({ packageName }) => packageName === '@openrouter/ai-sdk-provider',
    )
    const unresolvedPlan = buildModelLoadPlan('text', config)
    const plan = resolveModelModules(unresolvedPlan, {
      installationRoot: workspaceRoot,
    })

    expect(plan.stage).toBe('resolved')
    expect(plan.mode).toBe('text')
    expect(plan.modules.length).toBeGreaterThan(0)
    expect(plan.modules[0]?.resolvedPath).toContain('node_modules')
    expect(plan.modules[0]?.fileUrl.startsWith('file:')).toBe(true)
  })

  test('throws when the package is missing from installationRoot', async () => {
    const config = findConfig(textModelCatalog, ({ packageName }) => packageName === '@ai-sdk/openai')
    const unresolvedPlan = buildModelLoadPlan('text', config)
    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-sdk-json-schema-empty-'))

    try {
      expect(() =>
        resolveModelModules(unresolvedPlan, {
          installationRoot: missingRoot,
        }),
      ).toThrow(MissingProviderPackageError)
    } finally {
      await fs.rm(missingRoot, {
        recursive: true,
        force: true,
      })
    }
  })
})

describe('runtime execution', () => {
  test('executes an unresolved text plan through a host-provided loader', async () => {
    const config = findConfig(textModelCatalog, ({ packageName }) => packageName === '@ai-sdk/openai')
    const plan = buildModelLoadPlan('text', config)

    const model = await executeModelLoadPlan(plan, {
      async loadModule(module) {
        return (await import(module.specifier)) as Record<string, unknown>
      },
    })

    expect(model).toBeDefined()
  })

  test('executes a resolved text plan through the default importer', async () => {
    const config = findConfig(
      textModelCatalog,
      ({ packageName }) => packageName === '@openrouter/ai-sdk-provider',
    )
    const unresolvedPlan = buildModelLoadPlan('text', config)
    const resolvedPlan = resolveModelModules(unresolvedPlan, {
      installationRoot: workspaceRoot,
    })
    const model = await executeModelLoadPlan(resolvedPlan)

    expect(model).toBeDefined()
  })

  test('returns a multi-module text gateway plan and executes it through a host loader', async () => {
    const config = findConfig(
      textModelCatalog,
      ({ providerId, modelId, packageName }) =>
        providerId === 'cloudflare-ai-gateway' &&
        packageName === 'ai-gateway-provider' &&
        modelId.startsWith('openai/'),
    )
    const plan = buildModelLoadPlan('text', config)

    expect(plan.modules.length).toBe(2)
    expect(plan.modules.some((module) => module.specifier === 'ai-gateway-provider')).toBe(true)
    expect(
      plan.modules.some((module) => module.specifier.startsWith('ai-gateway-provider/providers/')),
    ).toBe(true)

    const model = await executeModelLoadPlan(plan, {
      async loadModule(module) {
        return (await import(module.specifier)) as Record<string, unknown>
      },
    })

    expect(model).toBeDefined()
  })

  test('loads an unknown text model id through provider defaults', async () => {
    const model = await loadTextModel(
      {
        provider: 'openai',
        model: 'gpt-next-preview',
      },
      {
        installationRoot: workspaceRoot,
      },
    )

    expect(model).toBeDefined()
  })

  test('loads a transcription model through the dedicated loader', async () => {
    const config = findConfig(
      transcriptionModelCatalog,
      ({ packageName }) => packageName === '@ai-sdk/openai',
    )
    const model = await loadTranscriptionModel(config, {
      installationRoot: workspaceRoot,
    })

    expect(model).toBeDefined()
  })

  test('fails the dedicated transcription loader for text-only entries', async () => {
    const config = findConfig(
      transcriptionModelCatalog,
      ({ supportedLoadModes }) =>
        supportedLoadModes?.includes('text') === true &&
        supportedLoadModes?.includes('transcription') !== true,
    )

    await expect(
      loadTranscriptionModel(config, {
        installationRoot: workspaceRoot,
      }),
    ).rejects.toThrow(AdapterConfigurationError)
  })

  test('loads an unknown transcription model id through provider defaults', async () => {
    const model = await loadTranscriptionModel(
      {
        provider: 'openai',
        model: 'gpt-next-preview',
      },
      {
        installationRoot: workspaceRoot,
      },
    )

    expect(model).toBeDefined()
  })
})
