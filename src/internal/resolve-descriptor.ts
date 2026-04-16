import { UnknownProviderError } from '../errors'
import { getSupportedLoadModes } from '../runtime/adapters'
import type { ModelConfig, ModelDescriptor, ModelMode } from '../types'
import type {
  GeneratedTextCatalog,
  GeneratedTextProvider,
  GeneratedTranscriptionCatalog,
  GeneratedTranscriptionProvider,
} from './catalog-types'

export interface GeneratedCatalogSet {
  textModelCatalog: GeneratedTextCatalog
  transcriptionModelCatalog: GeneratedTranscriptionCatalog
}

function createBaseDescriptor(
  mode: ModelMode,
  provider: GeneratedTextProvider | GeneratedTranscriptionProvider,
  config: ModelConfig,
) {
  return {
    mode,
    provider: provider.id,
    providerName: provider.name,
    providerDoc: provider.doc,
    env: provider.env,
    model: config.model,
  }
}

function createTranscriptionDescriptor(
  provider: GeneratedTranscriptionProvider,
  config: ModelConfig,
): ModelDescriptor {
  const baseDescriptor = createBaseDescriptor('transcription', provider, config)
  const model = provider.models[config.model]

  if (!model) {
    return {
      ...baseDescriptor,
      catalogMatch: false,
      name: config.model,
      supportedLoadModes: getSupportedLoadModes(provider.packageName),
      packageName: provider.packageName,
      api: provider.api,
    }
  }

  return {
    ...baseDescriptor,
    catalogMatch: true,
    name: model.name,
    supportedLoadModes: model.supportedLoadModes,
    packageName: model.packageName,
    api: model.api,
  }
}

function createTextDescriptor(catalogs: GeneratedCatalogSet, config: ModelConfig): ModelDescriptor {
  const textProvider = catalogs.textModelCatalog.providers[config.provider]

  if (!textProvider) {
    throw new UnknownProviderError(config.provider)
  }

  const baseDescriptor = createBaseDescriptor('text', textProvider, config)
  const textModel = textProvider.models[config.model]

  if (!textModel) {
    return {
      ...baseDescriptor,
      catalogMatch: false,
      name: config.model,
      supportedLoadModes: getSupportedLoadModes(textProvider.packageName),
      packageName: textProvider.packageName,
      api: textProvider.api,
      shape: textProvider.shape,
    }
  }

  return {
    ...baseDescriptor,
    ...textModel,
    catalogMatch: true,
    supportedLoadModes: getSupportedLoadModes(textModel.packageName),
  }
}

export function createModelDescriptor(
  catalogs: GeneratedCatalogSet,
  mode: ModelMode,
  config: ModelConfig,
): ModelDescriptor {
  if (mode === 'text') {
    return createTextDescriptor(catalogs, config)
  }

  const provider = catalogs.transcriptionModelCatalog.providers[config.provider]

  if (!provider) {
    throw new UnknownProviderError(config.provider)
  }

  return createTranscriptionDescriptor(provider, config)
}
