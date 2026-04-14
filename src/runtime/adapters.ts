import { AdapterConfigurationError } from '../errors'
import type {
  TextModelDescriptor,
  TextModelLoadOperation,
  TextModelModulePlan,
} from '../types'
import { isPlainObject, mergeOptions } from './utils'

export interface UnresolvedTextModelLoadPlan {
  adapterId: string
  modules: TextModelModulePlan[]
  operations: TextModelLoadOperation[]
  resultBinding: string
}

interface AdapterBuildContext {
  descriptor: TextModelDescriptor
  packageOptions: unknown
}

interface TextModelAdapter {
  readonly id: string
  buildPlan(context: AdapterBuildContext): UnresolvedTextModelLoadPlan
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
  methodName?(descriptor: TextModelDescriptor): string | undefined
  defaultFactoryOptions?(descriptor: TextModelDescriptor): Record<string, unknown> | undefined
}

const PACKAGES_WITH_BASE_URL = new Set([
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
  descriptor: TextModelDescriptor,
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

function normalizeGenericAdapterOptions(packageOptions: unknown): GenericAdapterOptions {
  if (!isPlainObject(packageOptions)) {
    return {}
  }

  const factoryCandidate = isPlainObject(packageOptions.factory)
    ? packageOptions.factory
    : isPlainObject(packageOptions.provider)
      ? packageOptions.provider
      : undefined
  const modelCandidate = isPlainObject(packageOptions.model)
    ? packageOptions.model
    : isPlainObject(packageOptions.languageModel)
      ? packageOptions.languageModel
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

function createCallableAdapter(config: CallableAdapterConfig): TextModelAdapter {
  return {
    id: config.id,
    buildPlan({ descriptor, packageOptions }) {
      const normalizedOptions = normalizeGenericAdapterOptions(packageOptions)
      const defaultFactoryOptions = mergeOptions(
        getDefaultFactoryOptions(descriptor),
        config.defaultFactoryOptions?.(descriptor),
      )
      const factoryOptions = mergeOptions(defaultFactoryOptions, normalizedOptions.factoryOptions)
      const methodName = config.methodName?.(descriptor)

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
            binding: 'textModel',
            targetBinding: 'provider',
            methodName,
            args: createModelArguments(descriptor.model, normalizedOptions.modelOptions),
          },
        ],
        resultBinding: 'textModel',
      }
    },
  }
}

function getOpenAICompatibleFactoryOptions(
  descriptor: TextModelDescriptor,
): Record<string, unknown> | undefined {
  return {
    name: descriptor.provider,
    supportsStructuredOutputs: descriptor.structuredOutput === true,
    ...(descriptor.api ? { baseURL: descriptor.api } : {}),
  }
}

function getOpenAICompatibleMethodName(descriptor: TextModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completionModel'
  }

  return undefined
}

function getOpenAIMethodName(descriptor: TextModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completion'
  }

  return undefined
}

function getOpenRouterMethodName(descriptor: TextModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completion'
  }

  return undefined
}

function getAihubmixMethodName(descriptor: TextModelDescriptor): string | undefined {
  if (descriptor.shape === 'completions') {
    return 'completion'
  }

  return undefined
}

const CALLABLE_ADAPTERS = [
  createCallableAdapter({
    id: '@ai-sdk/amazon-bedrock',
    createExportName: 'createAmazonBedrock',
  }),
  createCallableAdapter({
    id: '@ai-sdk/anthropic',
    createExportName: 'createAnthropic',
  }),
  createCallableAdapter({
    id: '@ai-sdk/azure',
    createExportName: 'createAzure',
  }),
  createCallableAdapter({
    id: '@ai-sdk/cerebras',
    createExportName: 'createCerebras',
  }),
  createCallableAdapter({
    id: '@ai-sdk/cohere',
    createExportName: 'createCohere',
  }),
  createCallableAdapter({
    id: '@ai-sdk/deepinfra',
    createExportName: 'createDeepInfra',
  }),
  createCallableAdapter({
    id: '@ai-sdk/gateway',
    createExportName: 'createGateway',
  }),
  createCallableAdapter({
    id: '@ai-sdk/google',
    createExportName: 'createGoogleGenerativeAI',
  }),
  createCallableAdapter({
    id: '@ai-sdk/google-vertex',
    createExportName: 'createVertex',
  }),
  createCallableAdapter({
    id: '@ai-sdk/google-vertex/anthropic',
    createExportName: 'createVertexAnthropic',
  }),
  createCallableAdapter({
    id: '@ai-sdk/groq',
    createExportName: 'createGroq',
  }),
  createCallableAdapter({
    id: '@ai-sdk/mistral',
    createExportName: 'createMistral',
  }),
  createCallableAdapter({
    id: '@ai-sdk/openai',
    createExportName: 'createOpenAI',
    methodName: getOpenAIMethodName,
  }),
  createCallableAdapter({
    id: '@ai-sdk/openai-compatible',
    createExportName: 'createOpenAICompatible',
    methodName: getOpenAICompatibleMethodName,
    defaultFactoryOptions: getOpenAICompatibleFactoryOptions,
  }),
  createCallableAdapter({
    id: '@ai-sdk/perplexity',
    createExportName: 'createPerplexity',
  }),
  createCallableAdapter({
    id: '@ai-sdk/togetherai',
    createExportName: 'createTogetherAI',
  }),
  createCallableAdapter({
    id: '@ai-sdk/vercel',
    createExportName: 'createVercel',
  }),
  createCallableAdapter({
    id: '@ai-sdk/xai',
    createExportName: 'createXai',
  }),
  createCallableAdapter({
    id: '@aihubmix/ai-sdk-provider',
    createExportName: 'createAihubmix',
    methodName: getAihubmixMethodName,
  }),
  createCallableAdapter({
    id: '@jerome-benoit/sap-ai-provider-v2',
    createExportName: 'createSAPAIProvider',
  }),
  createCallableAdapter({
    id: '@openrouter/ai-sdk-provider',
    createExportName: 'createOpenRouter',
    methodName: getOpenRouterMethodName,
    defaultFactoryOptions(descriptor) {
      return mergeOptions(getDefaultFactoryOptions(descriptor), {
        compatibility: 'strict',
      })
    },
  }),
  createCallableAdapter({
    id: 'gitlab-ai-provider',
    createExportName: 'createGitLab',
  }),
  createCallableAdapter({
    id: 'venice-ai-sdk-provider',
    createExportName: 'createVenice',
  }),
] as const

function getAiGatewayUpstream(descriptor: TextModelDescriptor) {
  const [prefix] = descriptor.model.split('/', 1)

  if (prefix === 'openai') {
    return {
      specifier: 'ai-gateway-provider/providers/openai',
      exportName: 'createOpenAI',
      methodName: getOpenAIMethodName(descriptor),
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
      methodName: getOpenAICompatibleMethodName(descriptor),
      defaultFactoryOptions: getOpenAICompatibleFactoryOptions(descriptor),
    }
  }

  throw new AdapterConfigurationError(
    'ai-gateway-provider',
    `Unsupported ai-gateway model prefix "${prefix}" for model "${descriptor.model}"`,
  )
}

const aiGatewayAdapter: TextModelAdapter = {
  id: 'ai-gateway-provider',
  buildPlan({ descriptor, packageOptions }) {
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
          binding: 'textModel',
          targetBinding: 'gateway',
          args: [
            {
              kind: 'binding',
              binding: 'upstreamModel',
            },
          ],
        },
      ],
      resultBinding: 'textModel',
    }
  },
}

const ADAPTERS = new Map<string, TextModelAdapter>(
  [...CALLABLE_ADAPTERS, aiGatewayAdapter].map((adapter) => [adapter.id, adapter]),
)

export const SUPPORTED_PACKAGE_NAMES = Object.freeze([...ADAPTERS.keys()].sort())

export function getTextModelAdapter(packageName: string): TextModelAdapter | undefined {
  return ADAPTERS.get(packageName)
}

export function buildUnresolvedTextModelLoadPlan(
  descriptor: TextModelDescriptor,
  packageOptions: unknown,
): UnresolvedTextModelLoadPlan {
  const adapter = getTextModelAdapter(descriptor.packageName)

  if (!adapter) {
    throw new AdapterConfigurationError(
      descriptor.packageName,
      `No adapter is configured for "${descriptor.packageName}"`,
    )
  }

  return adapter.buildPlan({
    descriptor,
    packageOptions,
  })
}
