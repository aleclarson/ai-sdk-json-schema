# ai-sdk-json-schema

## Purpose

`ai-sdk-json-schema` turns the `models.dev` provider catalog into committed generated data, Zod-first JSON config schemas, and runtime helpers for planning, resolving, and loading text or transcription models from provider packages.

The shipped JSON Schema files enumerate known providers and use model-id `examples` for autocomplete, while still allowing any string model id for known providers.

## Installation

```sh
pnpm add ai-sdk-json-schema
```

## Quick Example

```ts
import { resolveModel, textModelConfigSchema } from 'ai-sdk-json-schema'

const config = textModelConfigSchema.parse({
  provider: 'openai',
  model: 'gpt-4.1',
})

const descriptor = resolveModel('text', config)

console.log({
  catalogMatch: descriptor.catalogMatch,
  packageName: descriptor.packageName,
})
```

## Documentation Map

- Conceptual model, API selection, invariants, and recommended patterns: [docs/context.md](./docs/context.md)
- Runnable usage patterns:
  [examples/validate-config.ts](./examples/validate-config.ts),
  [examples/resolve-load-plan.ts](./examples/resolve-load-plan.ts),
  [examples/execute-load-plan.ts](./examples/execute-load-plan.ts),
  [examples/load-text-model.ts](./examples/load-text-model.ts),
  [examples/load-transcription-model.ts](./examples/load-transcription-model.ts)
- Release notes for downstream users: [CHANGELOG.md](./CHANGELOG.md)
- Exact exported signatures: [dist/index.d.mts](./dist/index.d.mts)
- Shipped JSON Schema files after build: `dist/schemas/text-model-config.schema.json`, `dist/schemas/transcription-model-config.schema.json`

The examples in this repo use the published package import path and can be run locally after `pnpm build`.

Run `pnpm generate` to refresh the committed catalogs and callable-adapter metadata from `models.dev` plus raw provider declaration sources on unpkg. The default repo script applies an 8-month text window and a 24-month transcription window. Override them with `--text-since YYYY-MM-DD` and `--transcription-since YYYY-MM-DD`, or use `--since YYYY-MM-DD` to force the same cutoff for both.
