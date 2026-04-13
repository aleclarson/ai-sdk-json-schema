export type ModelShape = 'completions' | 'responses'

export interface GeneratedTextModel {
  id: string
  name: string
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
  packageName: string
  api?: string
  shape?: ModelShape
}

export interface GeneratedTextProvider {
  id: string
  name: string
  doc: string
  env: readonly string[]
  models: Record<string, GeneratedTextModel>
}

export interface GeneratedCatalogSource {
  repo: string
  ref: string
  generatedAt: string
}

export interface GeneratedCatalog {
  source: GeneratedCatalogSource
  packageNames: readonly string[]
  providers: Record<string, GeneratedTextProvider>
}
