export type ModelShape = 'completions' | 'responses'
export type SupportedLoadMode = 'text' | 'transcription'

export interface GeneratedModelBase {
  id: string
  name: string
  packageName: string
  api?: string
}

export interface GeneratedTextModel extends GeneratedModelBase {
  family?: string
  attachment: boolean
  reasoning: boolean
  toolCall: boolean
  structuredOutput?: boolean
  temperature?: boolean
  knowledge?: string
  releaseDate: string
  lastUpdated: string
  modalities: {
    input: readonly string[]
    output: readonly string[]
  }
  shape?: ModelShape
}

export interface GeneratedTranscriptionModel extends GeneratedModelBase {
  supportedLoadModes: readonly SupportedLoadMode[]
}

export interface GeneratedCatalogProviderBase<MODEL> {
  id: string
  name: string
  doc: string
  env: readonly string[]
  packageName: string
  api?: string
  models: Record<string, MODEL>
}

export interface GeneratedTextProvider
  extends GeneratedCatalogProviderBase<GeneratedTextModel> {
  shape?: ModelShape
}

export interface GeneratedTranscriptionProvider
  extends GeneratedCatalogProviderBase<GeneratedTranscriptionModel> {}

export interface GeneratedCatalogSource {
  repo: string
  ref: string
  generatedAt: string
}

export interface GeneratedCatalog<PROVIDER> {
  source: GeneratedCatalogSource
  packageNames: readonly string[]
  providers: Record<string, PROVIDER>
}

export type GeneratedTextCatalog = GeneratedCatalog<GeneratedTextProvider>
export type GeneratedTranscriptionCatalog = GeneratedCatalog<GeneratedTranscriptionProvider>
