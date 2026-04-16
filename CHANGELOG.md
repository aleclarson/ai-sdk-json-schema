# Changelog

## 0.3.0

### Breaking Changes

- Renamed `generatedCatalog` to `textModelCatalog` and added `transcriptionModelCatalog`. No compatibility aliases are kept.
- Removed the text-only planning and runtime helpers in favor of the mode-aware `resolveModel`, `buildModelLoadPlan`, `resolveModelModules`, and `executeModelLoadPlan` APIs.
- Split convenience loading into `loadTextModel` and `loadTranscriptionModel`.

### Added

- Separate text and transcription schema families, including `dist/schemas/transcription-model-config.schema.json`.
- A generated transcription catalog with a reduced metadata shape tailored to speech-to-text use cases.
- Generated callable-adapter metadata for detecting package-level transcription capability.
- Independent default catalog windows: 8 months for text and 24 months for transcription.
- `supportedLoadModes` metadata on transcription catalog entries and resolved descriptors so hosts can inspect package-level text versus transcription capability.

### Changed

- Broadened `transcriptionModelCatalog` to include audio-input/text-output models whose package supports either text mode or transcription mode in this library.
- Kept `loadTranscriptionModel` and `buildModelLoadPlan('transcription', ...)` strict; text-only entries still fail with transcription adapter errors because the library does not translate transcription selections into text-mode selections.

### Upgrade Notes

- Pass `'text'` or `'transcription'` only at the config boundary. Later stages infer mode from the descriptor or load plan.
- Use `textModelCatalog` or `transcriptionModelCatalog` when selecting providers and bundled model examples.
- Treat transcription catalog membership as a selection hint, not a guarantee that the dedicated transcription API is available.
- Treat `supportedLoadModes` on transcription selections as package capability metadata, not proof that the same `{ provider, model }` can be resolved through text mode.
