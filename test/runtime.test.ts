import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { generatedCatalog } from '../src/catalog'
import { MissingProviderPackageError, MissingTemplateVariableError } from '../src/errors'
import {
  buildTextModelLoadPlan,
  executeTextModelLoadPlan,
  loadTextModel,
  resolveTextModel,
  resolveTextModelModules,
} from '../src/index'

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

function getPlanFactoryOptions(plan: ReturnType<typeof buildTextModelLoadPlan>) {
  const createProviderOperation = plan.operations.find(
    (operation) => operation.kind === 'create-binding' && operation.binding === 'provider',
  )

  if (!createProviderOperation || createProviderOperation.kind !== 'create-binding') {
    return undefined
  }

  return createProviderOperation.options
}

describe('runtime planning', () => {
  test('returns runtime metadata from resolveTextModel', () => {
    const config = findConfig(({ packageName }) => packageName === '@ai-sdk/openai')
    const descriptor = resolveTextModel(config)

    expect(descriptor.catalogMatch).toBe(true)
    expect(descriptor.provider).toBe(config.provider)
    expect(descriptor.model).toBe(config.model)
    expect(descriptor.packageName).toBe('@ai-sdk/openai')
  })

  test('builds an unresolved plan and accepts unknown model ids', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-next-preview',
    }
    const descriptor = resolveTextModel(config)
    const plan = buildTextModelLoadPlan(config)

    expect(descriptor.catalogMatch).toBe(false)
    expect(descriptor.name).toBe('gpt-next-preview')
    expect(descriptor.packageName).toBe('@ai-sdk/openai')
    expect(plan.stage).toBe('unresolved')
    expect(plan.descriptor.model).toBe('gpt-next-preview')
    expect(plan.modules.length).toBeGreaterThan(0)
    expect('resolvedPath' in plan.modules[0]!).toBe(false)
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

    const plan = buildTextModelLoadPlan(config, {
      env,
    })
    const options = getPlanFactoryOptions(plan)

    expect(JSON.stringify(options)).not.toContain('${')

    expect(() =>
      buildTextModelLoadPlan(config, {
        env: {},
      }),
    ).toThrow(MissingTemplateVariableError)
  })

  test('resolves module plans relative to installationRoot', () => {
    const config = findConfig(({ packageName }) => packageName === '@openrouter/ai-sdk-provider')
    const unresolvedPlan = buildTextModelLoadPlan(config)
    const plan = resolveTextModelModules(unresolvedPlan, {
      installationRoot: workspaceRoot,
    })

    expect(plan.stage).toBe('resolved')
    expect(plan.modules.length).toBeGreaterThan(0)
    expect(plan.modules[0]?.resolvedPath).toContain('node_modules')
    expect(plan.modules[0]?.fileUrl.startsWith('file:')).toBe(true)
  })

  test('throws when the package is missing from installationRoot', async () => {
    const config = findConfig(({ packageName }) => packageName === '@ai-sdk/openai')
    const unresolvedPlan = buildTextModelLoadPlan(config)
    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-sdk-json-schema-empty-'))

    try {
      expect(() =>
        resolveTextModelModules(unresolvedPlan, {
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
  test('executes an unresolved plan through a host-provided loader', async () => {
    const config = findConfig(({ packageName }) => packageName === '@ai-sdk/openai')
    const plan = buildTextModelLoadPlan(config)

    const model = await executeTextModelLoadPlan(plan, {
      async loadModule(module) {
        return (await import(module.specifier)) as Record<string, unknown>
      },
    })

    expect(model).toBeDefined()
  })

  test('executes a resolved plan through the default importer', async () => {
    const config = findConfig(({ packageName }) => packageName === '@openrouter/ai-sdk-provider')
    const unresolvedPlan = buildTextModelLoadPlan(config)
    const resolvedPlan = resolveTextModelModules(unresolvedPlan, {
      installationRoot: workspaceRoot,
    })
    const model = await executeTextModelLoadPlan(resolvedPlan)

    expect(model).toBeDefined()
  })

  test('returns a multi-module gateway plan and executes it through a host loader', async () => {
    const config = findConfig(
      ({ providerId, modelId, packageName }) =>
        providerId === 'cloudflare-ai-gateway' &&
        packageName === 'ai-gateway-provider' &&
        modelId.startsWith('openai/'),
    )
    const plan = buildTextModelLoadPlan(config)

    expect(plan.modules.length).toBe(2)
    expect(plan.modules.some((module) => module.specifier === 'ai-gateway-provider')).toBe(true)
    expect(
      plan.modules.some((module) => module.specifier.startsWith('ai-gateway-provider/providers/')),
    ).toBe(true)

    const model = await executeTextModelLoadPlan(plan, {
      async loadModule(module) {
        return (await import(module.specifier)) as Record<string, unknown>
      },
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
