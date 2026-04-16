# Overview

`ai-sdk-json-schema` is a mode-aware catalog and runtime bridge built from `anomalyco/models.dev`.

It commits two reduced catalogs:

- `textModelCatalog`
- `transcriptionModelCatalog`

It then derives Zod 4 schemas and JSON Schema from those catalogs and exposes runtime helpers that separate model loading into three explicit stages:

- planning
- filesystem resolution
- execution

That split lets hosts decide package-loading policy before they anchor resolution to an `installationRoot` or import any provider package.

## When to Use

- You accept JSON config from users, files, or editors and want narrow validation plus autocomplete for text or transcription model selection.
- You need to know which npm package and module specifiers a config maps to before importing anything.
- You want host-controlled package resolution via `installationRoot` instead of assuming the library's own dependency tree.
- You need to mix bundled lazy imports with install-on-demand packages without duplicating adapter logic.
- You want generated JSON Schema, but you do not want JSON Schema to become a second handwritten validation surface.

## When Not to Use

- You need image-only, speech-generation, or other non-text/non-transcription model selection.
- You want credentials, headers, or provider-specific request options embedded in the JSON config itself.
- You are maintaining a fully hand-curated provider registry that does not derive from `models.dev`.

## Core Abstractions

- `ModelConfig`
  The only JSON config shape this library validates: `{ provider, model }`.
- `ModelMode`
  The runtime mode discriminant: `'text' | 'transcription'`.
- `textModelCatalog`
  The committed data snapshot of text-capable models produced by `pnpm generate`.
- `transcriptionModelCatalog`
  The committed data snapshot of transcription-capable models produced by `pnpm generate`.
- `textModelConfigSchema`
  The top-level Zod schema for validating known text providers and string model ids.
- `transcriptionModelConfigSchema`
  The top-level Zod schema for validating known transcription providers and string model ids.
- `ModelDescriptor`
  A validated selection plus catalog metadata such as package name, capabilities, API template, and model shape.
- `UnresolvedModelLoadPlan`
  The adapter-aware, filesystem-agnostic plan returned by `buildModelLoadPlan`.
- `ResolvedModelLoadPlan`
  The fully resolved module and operation plan returned by `resolveModelModules`.

## Data Flow / Lifecycle

1. `pnpm generate` scrapes `models.dev/providers/**`, parses TOML, applies the repo's default 8-month text cutoff and 24-month transcription cutoff, and writes committed text and transcription catalogs from the same upstream snapshot.
2. The text catalog retains models whose output modalities include `text`.
3. The transcription catalog retains models whose input modalities include `audio`, whose output modalities include `text`, and whose package is loadable in transcription mode.
4. During generation, callable-provider adapter metadata is regenerated from provider-listed package names by fetching raw declaration source from unpkg and scanning for `transcription` support.
5. For editor and file validation, the text and transcription config schemas validate a `{ provider, model }` object where `provider` is catalog-known and `model` is any string.
6. The generated JSON Schema uses the `examples` keyword to surface catalog-known model ids for autocomplete without rejecting unlisted ids.
7. At runtime, `resolveModel(mode, config)` only requires `provider` and `model` to be strings. Unknown model ids fall back to provider defaults so newer or older model ids can still be used.
8. `buildModelLoadPlan(mode, config, options)` expands catalog templates such as `${ENV_VAR}`, merges runtime `packageOptions`, selects an adapter, and returns unresolved module specifiers plus execution operations.
9. `resolveModelModules(plan, options)` resolves each planned module specifier relative to `installationRoot`.
10. `executeModelLoadPlan(plan, options)` imports or host-loads the planned modules and executes the binding operations to construct the final model instance.
11. `loadTextModel` and `loadTranscriptionModel` are convenience wrappers that run all three stages with a default `installationRoot` of `process.cwd()`.

## Common Tasks -> Recommended APIs

- Validate arbitrary text JSON config:
  `textModelConfigSchema`
- Validate arbitrary transcription JSON config:
  `transcriptionModelConfigSchema`
- Validate config for one known provider:
  `textModelConfigSchemasByProvider[providerId]`
  `transcriptionModelConfigSchemasByProvider[providerId]`
- Accept newer or older model ids at runtime:
  `resolveModel`
  `buildModelLoadPlan`
  `loadTextModel`
  `loadTranscriptionModel`
- Generate editor-facing JSON Schema:
  `textModelConfigJsonSchema`
  `textModelConfigJsonSchemasByProvider[providerId]`
  `transcriptionModelConfigJsonSchema`
  `transcriptionModelConfigJsonSchemasByProvider[providerId]`
- Inspect package name and model metadata without touching the filesystem:
  `resolveModel`
- Inspect adapter-selected modules and operations before touching the filesystem:
  `buildModelLoadPlan`
- Resolve exact file paths from a host-controlled dependency root:
  `resolveModelModules`
- Fully load the selected model from installed packages:
  `loadTextModel`
  `loadTranscriptionModel`
- Execute a plan with host-owned module loading:
  `executeModelLoadPlan`
  See `examples/execute-load-plan.ts` for the bundled-provider flow.

## Recommended Patterns

- Validate config at the boundary where JSON enters the system, then persist the parsed `{ provider, model }`.
- Use the shipped JSON Schema files for provider validation and model autocomplete, but let runtime loading accept model ids that are newer or older than the bundled catalog.
  The model-id suggestions come from JSON Schema `examples`, not from a closed enum.
- Treat `installationRoot` as the host application's dependency root, not the library's source directory.
- Pass `mode` only at the config boundary with `resolveModel` or `buildModelLoadPlan`.
- Reuse the mode tagged onto descriptors and plans instead of carrying extra mode state through later stages.
- Choose `loadTextModel` or `loadTranscriptionModel` at the convenience-loader boundary instead of building a union-returning wrapper around both.
- Keep secrets and provider-factory settings in environment variables or `packageOptions`, not in `ModelConfig`.

## Patterns to Avoid

- Embedding API keys or provider request configuration inside the JSON config.
- Hand-maintaining provider/model enums outside the generated catalogs.
- Calling `loadTextModel` or `loadTranscriptionModel` when the host needs a custom install-or-retry loop; build and execute the plan directly instead.

## Invariants and Constraints

- Text catalog entries always declare `text` in output modalities.
- Transcription catalog entries always declare `audio` in input modalities and `text` in output modalities.
- Runtime resolution falls back to provider defaults when a model id is not present in the selected generated catalog.
- Generated files are data-only and committed to the repository.
- Zod is the validation source of truth; JSON Schema is emitted from Zod rather than maintained separately.
- Every retained package must be loadable through generated callable-adapter metadata or a handwritten special-case adapter for the selected mode.
- `ai-gateway-provider` remains a handwritten text-only special case.
- Module resolution is anchored to `path.join(installationRoot, 'package.json')`.
- Catalog-provided API templates may include `${ENV_VAR}` placeholders and must be satisfiable from `options.env` or `process.env`.
- The transcription catalog intentionally keeps only speech-to-text-relevant model metadata: `id`, `name`, `packageName`, and optional `api`.

## Error Model

- `UnknownProviderError`
  The provider id is missing from the selected generated catalog.
- `MissingTemplateVariableError`
  A catalog-derived template could not be expanded because an environment variable was missing.
- `MissingProviderPackageError`
  A required package or subpath could not be resolved from `installationRoot`.
- `InvalidProviderModuleError`
  A provider module did not export the symbol required by its adapter.
- `AdapterConfigurationError`
  The runtime adapter registry cannot describe how to load a retained package or model family for the selected mode.

## Terminology

- Provider
  A top-level `models.dev` provider id such as `openai`.
- Model
  A provider-local model id such as `gpt-4.1`.
- Mode
  The runtime family the model is being resolved for: `text` or `transcription`.
- Descriptor
  The resolved metadata returned by `resolveModel`.
- Unresolved load plan
  The adapter-selected module and operation plan returned by `buildModelLoadPlan`.
- Resolved load plan
  The filesystem-resolved module and operation plan returned by `resolveModelModules`.
- Installation root
  The directory whose `package.json` anchors provider-package resolution.
- Adapter
  The runtime logic that maps a package name to module specifiers and invocation steps.

## Non-Goals

- Validating credentials or package-specific provider settings inside JSON config.
- Supporting arbitrary non-text/non-transcription model families.
- Loading arbitrary provider packages without explicit adapter coverage.
