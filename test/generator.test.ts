import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  createGeneratedCatalogFromProvidersDir,
  createGeneratedCatalogsFromProvidersDir,
} from '../src/internal/generate-catalog'

async function withTempProvidersDir(
  files: Record<string, string>,
  run: (providersDir: string) => Promise<void> | void,
) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-sdk-json-schema-'))

  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const filePath = path.join(tempDir, relativePath)
      await fs.mkdir(path.dirname(filePath), {
        recursive: true,
      })
      await fs.writeFile(filePath, contents)
    }

    await run(tempDir)
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    })
  }
}

describe('createGeneratedCatalogFromProvidersDir', () => {
  test('keeps nested model ids, provider overrides, and third-party packages for text mode', async () => {
    await withTempProvidersDir(
      {
        'alpha/provider.toml': [
          'name = "Alpha"',
          'npm = "@ai-sdk/openai-compatible"',
          'env = ["ALPHA_API_KEY"]',
          'doc = "https://alpha.example/docs"',
          'api = "https://alpha.example/v1"',
        ].join('\n'),
        'alpha/models/chat/basic.toml': [
          'name = "Basic Chat"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2026-01-01"',
          'last_updated = "2026-01-02"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
        'alpha/models/image-only.toml': [
          'name = "Image Only"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = true',
          'release_date = "2026-01-01"',
          'last_updated = "2026-01-02"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["image"]',
        ].join('\n'),
        'alpha/models/override.toml': [
          'name = "Override"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'structured_output = true',
          'temperature = true',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
          '',
          '[provider]',
          'npm = "@openrouter/ai-sdk-provider"',
          'api = "https://override.example/v1"',
          'shape = "completions"',
        ].join('\n'),
        'venice/provider.toml': [
          'name = "Venice"',
          'npm = "venice-ai-sdk-provider"',
          'env = ["VENICE_API_KEY"]',
          'doc = "https://venice.example/docs"',
        ].join('\n'),
        'venice/models/free.toml': [
          'name = "Venice Free"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2026-01-05"',
          'last_updated = "2026-01-06"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
      },
      (providersDir) => {
        const catalog = createGeneratedCatalogFromProvidersDir({
          providersDir,
          generatedAt: '2026-01-01T00:00:00.000Z',
          ref: 'fixture',
          parseToml(source) {
            return Bun.TOML.parse(source)
          },
        })

        expect(catalog.providers.alpha).toBeDefined()
        expect(catalog.providers.alpha?.models['chat/basic']).toBeDefined()
        expect(catalog.providers.alpha?.models['image-only']).toBeUndefined()
        expect(catalog.providers.alpha?.models.override?.packageName).toBe(
          '@openrouter/ai-sdk-provider',
        )
        expect(catalog.providers.alpha?.models.override?.api).toBe('https://override.example/v1')
        expect(catalog.providers.alpha?.models.override?.shape).toBe('completions')
        expect(catalog.providers.venice?.models.free?.packageName).toBe('venice-ai-sdk-provider')
        expect(catalog.packageNames).toEqual([
          '@ai-sdk/openai-compatible',
          '@openrouter/ai-sdk-provider',
          'venice-ai-sdk-provider',
        ])
      },
    )
  })

  test('fails when a text provider package is unsupported', async () => {
    await withTempProvidersDir(
      {
        'unsupported/provider.toml': [
          'name = "Unsupported"',
          'npm = "totally-unknown-provider"',
          'env = ["UNSUPPORTED_API_KEY"]',
          'doc = "https://unsupported.example/docs"',
        ].join('\n'),
        'unsupported/models/default.toml': [
          'name = "Unsupported Model"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2026-01-01"',
          'last_updated = "2026-01-01"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
      },
      (providersDir) => {
        expect(() =>
          createGeneratedCatalogFromProvidersDir({
            providersDir,
            generatedAt: '2026-01-01T00:00:00.000Z',
            ref: 'fixture',
            parseToml(source) {
              return Bun.TOML.parse(source)
            },
          }),
        ).toThrow(/unsupported text package/)
      },
    )
  })

  test('filters text models by since using release_date or last_updated', async () => {
    await withTempProvidersDir(
      {
        'alpha/provider.toml': [
          'name = "Alpha"',
          'npm = "@ai-sdk/openai-compatible"',
          'env = ["ALPHA_API_KEY"]',
          'doc = "https://alpha.example/docs"',
          'api = "https://alpha.example/v1"',
        ].join('\n'),
        'alpha/models/old.toml': [
          'name = "Old"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2025-09-30"',
          'last_updated = "2025-09-30"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
        'alpha/models/updated.toml': [
          'name = "Updated"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2025-09-01"',
          'last_updated = "2025-10-02"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
        'alpha/models/released.toml': [
          'name = "Released"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2025-10-01"',
          'last_updated = "2025-10-01"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
        'alpha/models/old-unsupported.toml': [
          'name = "Old Unsupported"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2025-09-01"',
          'last_updated = "2025-09-15"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
          '',
          '[provider]',
          'npm = "totally-unknown-provider"',
        ].join('\n'),
      },
      (providersDir) => {
        const catalog = createGeneratedCatalogFromProvidersDir(
          {
            providersDir,
            generatedAt: '2026-01-01T00:00:00.000Z',
            ref: 'fixture',
            since: '2025-10-01',
            parseToml(source) {
              return Bun.TOML.parse(source)
            },
          },
          'text',
        )

        expect(catalog.providers.alpha?.models.old).toBeUndefined()
        expect(catalog.providers.alpha?.models.updated).toBeDefined()
        expect(catalog.providers.alpha?.models.released).toBeDefined()
        expect(catalog.providers.alpha?.models['old-unsupported']).toBeUndefined()
        expect(catalog.providers.alpha?.packageName).toBe('@ai-sdk/openai-compatible')
        expect(catalog.packageNames).toEqual(['@ai-sdk/openai-compatible'])
      },
    )
  })

  test('keeps transcription providers even when all retained models are filtered out', async () => {
    await withTempProvidersDir(
      {
        'openai/provider.toml': [
          'name = "OpenAI"',
          'npm = "@ai-sdk/openai"',
          'env = ["OPENAI_API_KEY"]',
          'doc = "https://openai.example/docs"',
          'api = "https://api.openai.example/v1"',
        ].join('\n'),
        'openai/models/text-only.toml': [
          'name = "Text Only"',
          'attachment = false',
          'reasoning = false',
          'tool_call = true',
          'temperature = true',
          'release_date = "2026-01-01"',
          'last_updated = "2026-01-02"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
      },
      (providersDir) => {
        const catalog = createGeneratedCatalogFromProvidersDir(
          {
            providersDir,
            generatedAt: '2026-01-01T00:00:00.000Z',
            ref: 'fixture',
            parseToml(source) {
              return Bun.TOML.parse(source)
            },
          },
          'transcription',
        )

        expect(catalog.providers.openai).toBeDefined()
        expect(catalog.providers.openai?.models).toEqual({})
        expect(catalog.providers.openai?.packageName).toBe('@ai-sdk/openai')
      },
    )
  })

  test('creates a transcription catalog using the package heuristic', async () => {
    await withTempProvidersDir(
      {
        'openai/provider.toml': [
          'name = "OpenAI"',
          'npm = "@ai-sdk/openai"',
          'env = ["OPENAI_API_KEY"]',
          'doc = "https://openai.example/docs"',
          'api = "https://api.openai.example/v1"',
        ].join('\n'),
        'openai/models/audio-chat.toml': [
          'name = "Audio Chat"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = true',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["text", "audio"]',
          'output = ["text"]',
        ].join('\n'),
        'openai/models/text-only.toml': [
          'name = "Text Only"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = true',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["text"]',
          'output = ["text"]',
        ].join('\n'),
        'openai/models/audio-output.toml': [
          'name = "Audio Output"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = true',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["audio"]',
          'output = ["audio"]',
        ].join('\n'),
        'openai/models/audio-unsupported.toml': [
          'name = "Audio Unsupported"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = true',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["audio"]',
          'output = ["text"]',
          '',
          '[provider]',
          'npm = "@ai-sdk/openai-compatible"',
        ].join('\n'),
        'openai/models/audio-no-runtime.toml': [
          'name = "Audio No Runtime"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = true',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["audio"]',
          'output = ["text"]',
          '',
          '[provider]',
          'npm = "totally-unknown-provider"',
        ].join('\n'),
        'groq/provider.toml': [
          'name = "Groq"',
          'npm = "@ai-sdk/groq"',
          'env = ["GROQ_API_KEY"]',
          'doc = "https://groq.example/docs"',
        ].join('\n'),
        'groq/models/whisper-large-v3.toml': [
          'name = "Whisper Large v3"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = false',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["audio"]',
          'output = ["text"]',
        ].join('\n'),
        'compat/provider.toml': [
          'name = "Compat"',
          'npm = "@ai-sdk/openai-compatible"',
          'env = ["COMPAT_API_KEY"]',
          'doc = "https://compat.example/docs"',
          'api = "https://compat.example/v1"',
        ].join('\n'),
        'compat/models/whisper-large-v3.toml': [
          'name = "Whisper Large v3"',
          'attachment = false',
          'reasoning = false',
          'tool_call = false',
          'temperature = false',
          'release_date = "2026-01-03"',
          'last_updated = "2026-01-04"',
          '',
          '[modalities]',
          'input = ["audio"]',
          'output = ["text"]',
        ].join('\n'),
      },
      (providersDir) => {
        const catalog = createGeneratedCatalogFromProvidersDir(
          {
            providersDir,
            generatedAt: '2026-01-01T00:00:00.000Z',
            ref: 'fixture',
            parseToml(source) {
              return Bun.TOML.parse(source)
            },
          },
          'transcription',
        )

        expect(catalog.providers.openai).toBeDefined()
        expect(catalog.providers.compat).toBeDefined()
        expect(catalog.providers.groq).toBeDefined()

        expect(catalog.providers.openai?.models['audio-chat']).toEqual({
          id: 'audio-chat',
          name: 'Audio Chat',
          packageName: '@ai-sdk/openai',
          api: 'https://api.openai.example/v1',
          supportedLoadModes: ['text', 'transcription'],
        })
        expect(catalog.providers.openai?.models['text-only']).toBeUndefined()
        expect(catalog.providers.openai?.models['audio-output']).toBeUndefined()
        expect(catalog.providers.openai?.models['audio-unsupported']).toEqual({
          id: 'audio-unsupported',
          name: 'Audio Unsupported',
          packageName: '@ai-sdk/openai-compatible',
          api: 'https://api.openai.example/v1',
          supportedLoadModes: ['text'],
        })
        expect(catalog.providers.openai?.models['audio-no-runtime']).toBeUndefined()
        expect(catalog.providers.groq?.models['whisper-large-v3']).toEqual({
          id: 'whisper-large-v3',
          name: 'Whisper Large v3',
          packageName: '@ai-sdk/groq',
          supportedLoadModes: ['text', 'transcription'],
        })
        expect(catalog.providers.compat?.models['whisper-large-v3']).toEqual({
          id: 'whisper-large-v3',
          name: 'Whisper Large v3',
          packageName: '@ai-sdk/openai-compatible',
          api: 'https://compat.example/v1',
          supportedLoadModes: ['text'],
        })
        expect(catalog.packageNames).toEqual([
          '@ai-sdk/groq',
          '@ai-sdk/openai',
          '@ai-sdk/openai-compatible',
        ])
      },
    )
  })
})
