import { AdapterConfigurationError } from '../errors'
import { generatedCallableAdapterConfigs } from '../generated/callable-adapters'
import type { ModelDescriptor, ModelLoadOperation, ModelMode, ModelModulePlan } from '../types'
import { isPlainObject, mergeOptions } from './utils'

export interface UnresolvedAdapterLoadPlan {
  adapterId: string
  modules: ModelModulePlan[]
  operations: ModelLoadOperation[]
  resultBinding: string
}

interface AdapterBuildContext {
  descriptor: ModelDescriptor
  packageOptions: unknown
}

interface ModelAdapter {
  readonly id: string
  buildTextPlan?(context: AdapterBuildContext): UnresolvedAdapterLoadPlan
  buildTranscriptionPlan?(context: AdapterBuildContext): UnresolvedAdapterLoadPlan
}

interface GenericAdapterOptions {
  factoryOptions?: Record<string, unknown>
  modelOptions?: Record<string, unknown>
}

interface AiGatewayAdapterOptions {
  gatewayOptions?: Record<string, unknown>
  upstreamOptions?: Record<string, unknown>
  modelOptions?: Record<string, unknown>
}

interface CallableAdapterConfig {
  id: string
  moduleSpecifier?: string
  createExportName: string
  textMethodName?(descriptor: ModelDescriptor): string | undefined
  transcriptionMethodName?(descriptor: ModelDescriptor): string | undefined
  defaultFactoryOptions?(descriptor: ModelDescriptor): Record<string, unknown> | undefined
}

const BUILD_METHOD_BY_MODE = {
  text: 'buildTextPlan',
  transcription: 'buildTranscriptionPlan',
} as const satisfies Record<ModelMode, keyof ModelAdapter>

const PACKAGES_WITH_BASE_URL = new Set([
  '@ai-sdk/alibaba',
  '@ai-sdk/anthropic',
  '@ai-sdk/azure',
  '@ai-sdk/cerebras',
  '@ai-sdk/deepinfra',
  '@ai-sdk/gateway',
  '@ai-sdk/google',
  '@ai-sdk/google-vertex',
  '@ai-sdk/google-vertex/anthropic',
  '@ai-sdk/groq',
  '@ai-sdk/mistral',
  '@ai-sdk/openai',
  '@ai-sdk/perplexity',
  '@ai-sdk/togetherai',
  '@ai-sdk/vercel',
  '@ai-sdk/xai',
  '@openrouter/ai-sdk-provider',
  'venice-ai-sdk-provider',
])

function createModelArguments(modelId: string, modelOptions: Record<string, unknown> | undefined) {
  const args: Array<{
    kind: 'value'
    value: unknown
  }> = [
    {
      kind: 'value',
      value: modelId,
    },
  ]

  if (modelOptions && Object.keys(modelOptions).length > 0) {
    args.push({
      kind: 'value',
      value: modelOptions,
    })
  }

  return args
}

function getDefaultFactoryOptions(
  descriptor: ModelDescriptor,
): Record<string, unknown> | undefined {
  if (descriptor.api === undefined) {
    return undefined
  }

  if (PACKAGES_WITH_BASE_URL.has(descriptor.packageName)) {
    return {
      baseURL: descriptor.api,
    }
  }

  return undefined
}

function normalizeGenericAdapterOptions(
  packageOptions: unknown,
  mode: ModelMode,
): GenericAdapterOptions {
  if (!isPlainObject(packageOptions)) {
    return {}
  }

  const factoryCandidate = isPlainObject(packageOptions.factory)
    ? packageOptions.factory
    : isPlainObject(packageOptions.provider)
      ? packageOptions.provider
      : undefined
  const modelAlias = mode === 'text' ? 'languageModel' : 'transcriptionModel'
  const modelCandidate = isPlainObject(packageOptions.model)
    ? packageOptions.model
    : isPlainObject(packageOptions[modelAlias])
      ? packageOptions[modelAlias]
      : undefined

  if (factoryCandidate || modelCandidate) {
    return {
      factoryOptions: factoryCandidate,
      modelOptions: modelCandidate,
    }
  }

  return {
    factoryOptions: packageOptions,
  }
}

function normalizeAiGatewayAdapterOptions(packageOptions: unknown): AiGatewayAdapterOptions {
  if (!isPlainObject(packageOptions)) {
    return {}
  }

  const gatewayCandidate = isPlainObject(packageOptions.gateway)
    ? packageOptions.gateway
    : undefined
  const upstreamCandidate = isPlainObject(packageOptions.upstream)
    ? packageOptions.upstream
    : isPlainObject(packageOptions.provider)
      ? packageOptions.provider
      : undefined
  const modelCandidate = isPlainObject(packageOptions.model) ? packageOptions.model : undefined

  if (gatewayCandidate || upstreamCandidate || modelCandidate) {
    return {
      gatewayOptions: gatewayCandidate,
      upstreamOptions: upstreamCandidate,
      modelOptions: modelCandidate,
    }
  }

  return {
    gatewayOptions: packageOptions,
  }
}

function createCallablePlan(
  config: CallableAdapterConfig,
  descriptor: ModelDescriptor,
  packageOptions: unknown,
  mode: ModelMode,
  methodNameResolver: ((descriptor: ModelDescriptor) => string | undefined) | undefined,
): UnresolvedAdapterLoadPlan {
  const normalizedOptions = normalizeGenericAdapterOptions(packageOptions, mode)
  const defaultFactoryOptions = mergeOptions(
    getDefaultFactoryOptions(descriptor),
    config.defaultFactoryOptions?.(descriptor),
  )
  const factoryOptions = mergeOptions(defaultFactoryOptions, normalizedOptions.factoryOptions)
  const methodName = methodNameResolver?.(descriptor)

  return {
    adapterId: config.id,
    modules: [
      {
        role: 'provider-factory',
        specifier: config.moduleSpecifier ?? config.id,
        packageName: config.id,
        exportName: config.createExportName,
      },
    ],
    operations: [
      {
        kind: 'create-binding',
        binding: 'provider',
        moduleRole: 'provider-factory',
        options: factoryOptions,
      },
      {
        kind: 'invoke-binding',
        binding: 'model',
        targetBinding: 'provider',
        methodName,
        args: createModelArguments(descriptor.model, normalizedOptions.modelOptions),
      },
    ],
    resultBinding: 'model',
  }
}

function createCallableAdapter(config: CallableAdapterConfig): ModelAdapter {
  return {
    id: config.id,
    buildTextPlan({ descriptor, packageOptions }) {
      return createCallablePlan(config, descriptor, packageOptions, 'text', config.textMethodName)
    },
    ...(config.transcriptionMethodName
      ? {
          buildTranscriptionPlan({ descriptor, packageOptions }: AdapterBuildContext) {
            return createCallablePlan(
              config,
              descriptor,
              packageOptions,
              'transcription',
              config.transcriptionMethodName,
            )
          },
        }
      : {}),
  }
}

function getOpenAICompatibleFactoryOptions(
  descriptor: ModelDescriptor,
): Record<string, unknown> | undefined {
  return {
    name: descriptor.provider,
    supportsStructuredOutputs: descriptor.structuredOutput === true,
    ...(descriptor.api ? { baseURL: descriptor.api } : {}),
  }
}

function getOpenAICompatibleTextMethodName(descriptor: ModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completionModel'
  }

  return undefined
}

function getOpenAITextMethodName(descriptor: ModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completion'
  }

  return undefined
}

function getOpenRouterTextMethodName(descriptor: ModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completion'
  }

  return undefined
}

function getAihubmixTextMethodName(descriptor: ModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completion'
  }

  return undefined
}

function getTranscriptionMethodName(): string {
  return 'transcription'
}

const CALLABLE_ADAPTER_OVERRIDES: Record<string, Partial<CallableAdapterConfig>> = {
  '@ai-sdk/openai': {
    textMethodName: getOpenAITextMethodName,
  },
  '@ai-sdk/openai-compatible': {
    textMethodName: getOpenAICompatibleTextMethodName,
    defaultFactoryOptions: getOpenAICompatibleFactoryOptions,
  },
  '@aihubmix/ai-sdk-provider': {
    textMethodName: getAihubmixTextMethodName,
  },
  '@openrouter/ai-sdk-provider': {
    textMethodName: getOpenRouterTextMethodName,
    defaultFactoryOptions(descriptor: ModelDescriptor) {
      return mergeOptions(getDefaultFactoryOptions(descriptor), {
        compatibility: 'strict',
      })
    },
  },
}

const CALLABLE_ADAPTERS = generatedCallableAdapterConfigs.map((config) =>
  createCallableAdapter({
    id: config.id,
    createExportName: config.createExportName,
    ...CALLABLE_ADAPTER_OVERRIDES[config.id],
    ...(config.supportsTranscription
      ? {
          transcriptionMethodName: getTranscriptionMethodName,
        }
      : {}),
  }),
)

function getAiGatewayUpstream(descriptor: ModelDescriptor) {
  const [prefix] = descriptor.model.split('/', 1)

  if (prefix === 'openai') {
    return {
      specifier: 'ai-gateway-provider/providers/openai',
      exportName: 'createOpenAI',
      methodName: getOpenAITextMethodName(descriptor),
      defaultFactoryOptions: getDefaultFactoryOptions(descriptor),
    }
  }

  if (prefix === 'anthropic') {
    return {
      specifier: 'ai-gateway-provider/providers/anthropic',
      exportName: 'createAnthropic',
      methodName: undefined,
      defaultFactoryOptions: getDefaultFactoryOptions(descriptor),
    }
  }

  if (prefix === 'workers-ai') {
    return {
      specifier: 'ai-gateway-provider/providers/unified',
      exportName: 'createUnified',
      methodName: getOpenAICompatibleTextMethodName(descriptor),
      defaultFactoryOptions: getOpenAICompatibleFactoryOptions(descriptor),
    }
  }

  throw new AdapterConfigurationError(
    'ai-gateway-provider',
    `Unsupported ai-gateway model prefix "${prefix}" for model "${descriptor.model}"`,
  )
}

const aiGatewayAdapter: ModelAdapter = {
  id: 'ai-gateway-provider',
  buildTextPlan({ descriptor, packageOptions }) {
    const upstream = getAiGatewayUpstream(descriptor)
    const normalizedOptions = normalizeAiGatewayAdapterOptions(packageOptions)
    const upstreamFactoryOptions = mergeOptions(
      upstream.defaultFactoryOptions,
      normalizedOptions.upstreamOptions,
    )

    return {
      adapterId: 'ai-gateway-provider',
      modules: [
        {
          role: 'gateway-factory',
          specifier: 'ai-gateway-provider',
          packageName: 'ai-gateway-provider',
          exportName: 'createAiGateway',
        },
        {
          role: 'upstream-factory',
          specifier: upstream.specifier,
          packageName: 'ai-gateway-provider',
          exportName: upstream.exportName,
        },
      ],
      operations: [
        {
          kind: 'create-binding',
          binding: 'upstreamProvider',
          moduleRole: 'upstream-factory',
          options: upstreamFactoryOptions,
        },
        {
          kind: 'invoke-binding',
          binding: 'upstreamModel',
          targetBinding: 'upstreamProvider',
          methodName: upstream.methodName,
          args: createModelArguments(descriptor.model, normalizedOptions.modelOptions),
        },
        {
          kind: 'create-binding',
          binding: 'gateway',
          moduleRole: 'gateway-factory',
          options: normalizedOptions.gatewayOptions,
        },
        {
          kind: 'invoke-binding',
          binding: 'model',
          targetBinding: 'gateway',
          args: [
            {
              kind: 'binding',
              binding: 'upstreamModel',
            },
          ],
        },
      ],
      resultBinding: 'model',
    }
  },
}

const ADAPTERS = new Map<string, ModelAdapter>(
  [...CALLABLE_ADAPTERS, aiGatewayAdapter].map((adapter) => [adapter.id, adapter]),
)

export const SUPPORTED_PACKAGE_NAMES_BY_MODE = Object.freeze({
  text: Object.freeze(
    [...ADAPTERS.values()]
      .filter((adapter) => adapter.buildTextPlan)
      .map((adapter) => adapter.id)
      .sort(),
  ),
  transcription: Object.freeze(
    [...ADAPTERS.values()]
      .filter((adapter) => adapter.buildTranscriptionPlan)
      .map((adapter) => adapter.id)
      .sort(),
  ),
}) satisfies Record<ModelMode, readonly string[]>

export function getSupportedPackageNames(mode: ModelMode): readonly string[] {
  return SUPPORTED_PACKAGE_NAMES_BY_MODE[mode]
}

export function supportsPackageMode(packageName: string, mode: ModelMode): boolean {
  return getSupportedPackageNames(mode).includes(packageName)
}

export function getModelAdapter(mode: ModelMode, packageName: string): ModelAdapter | undefined {
  const adapter = ADAPTERS.get(packageName)

  if (!adapter) {
    return undefined
  }

  return adapter[BUILD_METHOD_BY_MODE[mode]] ? adapter : undefined
}

export function buildUnresolvedModelLoadPlan(
  mode: ModelMode,
  descriptor: ModelDescriptor,
  packageOptions: unknown,
): UnresolvedAdapterLoadPlan {
  const adapter = getModelAdapter(mode, descriptor.packageName)

  if (!adapter) {
    throw new AdapterConfigurationError(
      descriptor.packageName,
      `No ${mode} adapter is configured for "${descriptor.packageName}"`,
    )
  }

  const buildPlan = adapter[BUILD_METHOD_BY_MODE[mode]]

  if (!buildPlan) {
    throw new AdapterConfigurationError(
      descriptor.packageName,
      `No ${mode} adapter is configured for "${descriptor.packageName}"`,
    )
  }

  return buildPlan({
    descriptor,
    packageOptions,
  })
}
