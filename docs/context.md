# Context

## Overview

`ai-sdk-json-schema` is a text-model catalog and runtime bridge built from `anomalyco/models.dev`.

It generates and commits a reduced catalog of text-capable models, derives Zod 4 schemas and JSON Schema from that catalog, and exposes runtime helpers that can either:

- validate and describe a `{ provider, model }` config without touching the filesystem, or
- resolve and load the provider package needed to construct the selected model from a caller-controlled installation root.

## When to Use

- You accept JSON config from users, files, or editors and want narrow validation plus autocomplete for model selection.
- You need to know which npm package and module specifiers a config maps to before importing anything.
- You want host-controlled package resolution via `installationRoot` instead of assuming the library's own dependency tree.
- You want generated JSON Schema, but you do not want JSON Schema to become a second handwritten validation surface.

## When Not to Use

- You need image-only, audio-only, or other non-text model selection.
- You want credentials, headers, or provider-specific request options embedded in the JSON config itself.
- You are maintaining a fully hand-curated provider registry that does not derive from `models.dev`.

## Core Abstractions

- `TextModelConfig`
  - The only JSON config shape this library validates: `{ provider, model }`.
- `generatedCatalog`
  - The committed data snapshot produced by `pnpm generate`.
- `textModelConfigSchema`
  - The top-level Zod schema for validating known providers and string model ids.
- `textModelConfigJsonSchema`
  - JSON Schema generated from the Zod schema for editor or tool integration.
- `TextModelDescriptor`
  - A validated selection plus catalog metadata such as package name, capabilities, API template, and model shape.
- `TextModelLoadPlan`
  - The import-free execution plan returned by `resolveTextModelLoadPlan`.

## Data Flow / Lifecycle

1. `pnpm generate` scrapes `models.dev/providers/**`, parses TOML, filters to models whose output modalities include `text`, applies the repo's default `--since 2025-10-01` cutoff to the catalog model list, and writes the committed generated catalog.
2. For editor and file validation, `textModelConfigSchema` or one of the provider-scoped schemas validates a `{ provider, model }` object where `provider` is catalog-known and `model` is any string.
3. The generated JSON Schema uses the `examples` keyword to surface catalog-known model ids for autocomplete without rejecting unlisted ids.
4. At runtime, `resolveTextModel` only requires `provider` and `model` to be strings. Unknown model ids fall back to provider defaults so newer or older model ids can still be used.
5. `resolveTextModelLoadPlan` expands catalog templates such as `${ENV_VAR}`, merges runtime `packageOptions`, and resolves the exact module specifiers relative to `installationRoot`.
6. `loadTextModel` imports the resolved modules and executes the planned binding operations to construct the final model instance.

## Common Tasks

- Validate arbitrary JSON config:
  - `textModelConfigSchema`
- Validate config for one known provider:
  - `textModelConfigSchemasByProvider[providerId]`
- Accept newer or older model ids at runtime:
  - `resolveTextModel`
  - `resolveTextModelLoadPlan`
  - `loadTextModel`
- Generate editor-facing JSON Schema:
  - `textModelConfigJsonSchema`
  - `textModelConfigJsonSchemasByProvider[providerId]`
- Inspect package name and model metadata without touching the filesystem:
  - `resolveTextModel`
- Inspect exact module specifiers and load operations before importing:
  - `resolveTextModelLoadPlan`
- Fully load the selected model from an installed provider package:
  - `loadTextModel`

## Recommended Patterns

- Validate config at the boundary where JSON enters the system, then persist the parsed `{ provider, model }`.
- Use the shipped JSON Schema files for provider validation and model autocomplete, but let runtime loading accept model ids that are newer or older than the bundled catalog.
  The model-id suggestions come from JSON Schema `examples`, not from a closed enum.
- Treat `installationRoot` as the host application's dependency root, not the library's source directory.
- Use `resolveTextModelLoadPlan` when the host wants to audit, install, or manually import provider packages before execution.
- Keep secrets and provider-factory settings in environment variables or `packageOptions`, not in `TextModelConfig`.

## Patterns to Avoid

- Embedding API keys or provider request configuration inside the JSON config.
- Hand-maintaining provider/model enums outside the generated catalog.
- Calling `loadTextModel` when the host needs a custom install-or-retry loop; use `resolveTextModel` or `resolveTextModelLoadPlan` first.

## Invariants and Constraints

- Only models whose declared output modalities include `text` are retained.
- Runtime resolution falls back to provider defaults when a model id is not present in the generated catalog.
- Generated files are data-only and committed to the repository.
- Zod is the validation source of truth; JSON Schema is emitted from Zod rather than maintained separately.
- Every retained npm package must have a handwritten adapter or generation fails.
- Module resolution is anchored to `path.join(installationRoot, 'package.json')`.
- Catalog-provided API templates may include `${ENV_VAR}` placeholders and must be satisfiable from `options.env` or `process.env`.

## Error Model

- `UnknownProviderError`
  - The provider id is missing from the generated catalog.
- `MissingTemplateVariableError`
  - A catalog-derived template could not be expanded because an environment variable was missing.
- `MissingProviderPackageError`
  - A required package or subpath could not be resolved from `installationRoot`.
- `InvalidProviderModuleError`
  - A resolved module did not export the symbol required by its adapter.
- `AdapterConfigurationError`
  - The handwritten adapter registry cannot describe how to load a retained package or model family.

## Terminology

- Provider
  - A top-level `models.dev` provider id such as `openai`.
- Model
  - A provider-local model id such as `gpt-4.1`.
- Descriptor
  - The resolved metadata returned by `resolveTextModel`.
- Load plan
  - The fully resolved module and operation plan returned by `resolveTextModelLoadPlan`.
- Installation root
  - The directory whose `package.json` anchors provider-package resolution.
- Adapter
  - The handwritten runtime logic that maps a package name to module specifiers and invocation steps.

## Non-Goals

- Validating credentials or package-specific provider settings inside JSON config.
- Supporting non-text model selection.
- Loading arbitrary provider packages without explicit adapter coverage.
