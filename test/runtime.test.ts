import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { generatedCatalog } from '../src/catalog'
import { MissingProviderPackageError, MissingTemplateVariableError } from '../src/errors'
import { loadTextModel, resolveTextModel, resolveTextModelLoadPlan } from '../src/index'

const workspaceRoot = path.resolve(import.meta.dir, '..')

function findConfig(
  predicate: (entry: {
    providerId: string
    modelId: string
    packageName: string
    api?: string
  }) => boolean,
) {
  for (const [providerId, provider] of Object.entries(generatedCatalog.providers)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (
        predicate({
          providerId,
          modelId,
          packageName: model.packageName,
          api: model.api,
        })
      ) {
        return {
          provider: providerId,
          model: modelId,
        }
      }
    }
  }

  throw new Error('No matching model found in generated catalog')
}

function getPlanFactoryOptions(plan: ReturnType<typeof resolveTextModelLoadPlan>) {
  const createProviderOperation = plan.operations.find(
    (operation) => operation.kind === 'create-binding' && operation.binding === 'provider',
  )

  if (!createProviderOperation || createProviderOperation.kind !== 'create-binding') {
    return undefined
  }

  return createProviderOperation.options
}

describe('runtime resolution', () => {
  test('returns runtime metadata from resolveTextModel', () => {
    const config = findConfig(({ packageName }) => packageName === '@ai-sdk/openai')
    const descriptor = resolveTextModel(config)

    expect(descriptor.catalogMatch).toBe(true)
    expect(descriptor.provider).toBe(config.provider)
    expect(descriptor.model).toBe(config.model)
    expect(descriptor.packageName).toBe('@ai-sdk/openai')
  })

  test('accepts unknown model ids and falls back to provider defaults', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-next-preview',
    }
    const descriptor = resolveTextModel(config)
    const plan = resolveTextModelLoadPlan(config, {
      installationRoot: workspaceRoot,
    })

    expect(descriptor.catalogMatch).toBe(false)
    expect(descriptor.name).toBe('gpt-next-preview')
    expect(descriptor.packageName).toBe('@ai-sdk/openai')
    expect(plan.descriptor.model).toBe('gpt-next-preview')
    expect(plan.modules.length).toBeGreaterThan(0)
  })

  test('resolves module plans relative to installationRoot', () => {
    const config = findConfig(({ packageName }) => packageName === '@openrouter/ai-sdk-provider')
    const plan = resolveTextModelLoadPlan(config, {
      installationRoot: workspaceRoot,
    })

    expect(plan.modules.length).toBeGreaterThan(0)
    expect(plan.modules[0]?.resolvedPath).toContain('node_modules')
    expect(plan.modules[0]?.fileUrl.startsWith('file:')).toBe(true)
  })

  test('interpolates API templates and fails on missing env variables', () => {
    const config = findConfig(({ api }) => typeof api === 'string' && api.includes('${'))
    const descriptor = resolveTextModel(config)
    const variableNames = [...(descriptor.api ?? '').matchAll(/\$\{([A-Z0-9_]+)\}/g)].map(
      (match) => match[1]!,
    )
    const env = Object.fromEntries(
      variableNames.map((name) => [name, `${name.toLowerCase()}-value`]),
    )

    const plan = resolveTextModelLoadPlan(config, {
      installationRoot: workspaceRoot,
      env,
    })
    const options = getPlanFactoryOptions(plan)

    expect(JSON.stringify(options)).not.toContain('${')

    expect(() =>
      resolveTextModelLoadPlan(config, {
        installationRoot: workspaceRoot,
        env: {},
      }),
    ).toThrow(MissingTemplateVariableError)
  })

  test('throws when the package is missing from installationRoot', async () => {
    const config = findConfig(({ packageName }) => packageName === '@ai-sdk/openai')
    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-sdk-json-schema-empty-'))

    try {
      expect(() =>
        resolveTextModelLoadPlan(config, {
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

describe('runtime loading', () => {
  test('loads an official provider model from installationRoot', async () => {
    const config = findConfig(({ packageName }) => packageName === '@ai-sdk/openai')
    const model = await loadTextModel(config, {
      installationRoot: workspaceRoot,
    })

    expect(model).toBeDefined()
  })

  test('loads a third-party provider model from installationRoot', async () => {
    const config = findConfig(({ packageName }) => packageName === '@openrouter/ai-sdk-provider')
    const model = await loadTextModel(config, {
      installationRoot: workspaceRoot,
    })

    expect(model).toBeDefined()
  })

  test('returns a multi-module plan for ai-gateway and loads it', async () => {
    const config = findConfig(
      ({ providerId, modelId, packageName }) =>
        providerId === 'cloudflare-ai-gateway' &&
        packageName === 'ai-gateway-provider' &&
        modelId.startsWith('openai/'),
    )
    const plan = resolveTextModelLoadPlan(config, {
      installationRoot: workspaceRoot,
    })

    expect(plan.modules.length).toBe(2)
    expect(plan.modules.some((module) => module.specifier === 'ai-gateway-provider')).toBe(true)
    expect(
      plan.modules.some((module) => module.specifier.startsWith('ai-gateway-provider/providers/')),
    ).toBe(true)

    const model = await loadTextModel(config, {
      installationRoot: workspaceRoot,
    })

    expect(model).toBeDefined()
  })

  test('loads an unknown model id through provider defaults', async () => {
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
})
