# Changelog

## 0.3.0

### Breaking Changes

- Renamed `generatedCatalog` to `textModelCatalog` and added `transcriptionModelCatalog`. No compatibility aliases are kept.
- Removed the text-only planning and runtime helpers in favor of the mode-aware `resolveModel`, `buildModelLoadPlan`, `resolveModelModules`, and `executeModelLoadPlan` APIs.
- Split convenience loading into `loadTextModel` and `loadTranscriptionModel`.

### Added

- Separate text and transcription schema families, including `dist/schemas/transcription-model-config.schema.json`.
- A generated transcription catalog with a reduced metadata shape tailored to speech-to-text use cases.
- A generated callable-adapter metadata file that detects transcription support from raw package declaration sources on unpkg.
- Independent default catalog windows: 8 months for text and 24 months for transcription.

### Upgrade Notes

- Pass `'text'` or `'transcription'` only at the config boundary. Later stages infer mode from the descriptor or load plan.
- Use `textModelCatalog` or `transcriptionModelCatalog` when selecting providers and bundled model examples.
