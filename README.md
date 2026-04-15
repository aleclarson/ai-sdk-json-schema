# ai-sdk-json-schema

## Purpose

`ai-sdk-json-schema` turns the `models.dev` provider catalog into committed generated data, Zod-first JSON config schemas, and runtime helpers for planning, resolving, and loading text models from provider packages.

The shipped JSON Schema files enumerate known providers and use model-id `examples` for autocomplete, while still allowing any string model id for known providers.

## Installation

```sh
pnpm add ai-sdk-json-schema
```

## Quick Example

```ts
import { generatedCatalog, resolveTextModel, textModelConfigSchema } from 'ai-sdk-json-schema'

const [providerId, provider] = Object.entries(generatedCatalog.providers).find(
  ([, provider]) => Object.keys(provider.models).length > 0,
)!
const [modelId] = Object.keys(provider.models)

const config = textModelConfigSchema.parse({
  provider: providerId,
  model: modelId,
})

const descriptor = resolveTextModel(config)

console.log(descriptor.packageName)
```

## Documentation Map

- Conceptual model and API selection: [docs/context.md](./docs/context.md)
- Runnable usage patterns: [examples/validate-config.ts](./examples/validate-config.ts), [examples/resolve-load-plan.ts](./examples/resolve-load-plan.ts), [examples/execute-load-plan.ts](./examples/execute-load-plan.ts), [examples/load-text-model.ts](./examples/load-text-model.ts)
- Exact exported signatures: [dist/index.d.mts](./dist/index.d.mts)
- Shipped JSON Schema file after build: `dist/schemas/text-model-config.schema.json`

The examples in this repo use the published package import path and can be run locally after `pnpm build`.

Run `pnpm generate` to refresh the committed catalog from `models.dev`. The default repo script applies `--since 2025-10-01`.
