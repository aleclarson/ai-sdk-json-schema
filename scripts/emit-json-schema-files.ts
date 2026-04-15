import fs from 'node:fs/promises'
import path from 'node:path'

import { createJsonSchemaFileEntries, stringifyJsonSchema } from '../src/internal/json-schema-files'

async function main() {
  const schemasDir = path.join(import.meta.dir, '..', 'dist', 'schemas')
  const entries = createJsonSchemaFileEntries()

  await fs.rm(schemasDir, {
    recursive: true,
    force: true,
  })

  for (const entry of entries) {
    const outputPath = path.join(schemasDir, entry.path)

    await fs.mkdir(path.dirname(outputPath), {
      recursive: true,
    })
    await fs.writeFile(outputPath, stringifyJsonSchema(entry.schema))
  }

  const label = entries.length === 1 ? 'file' : 'files'
  console.log(`Wrote ${entries.length} JSON Schema ${label} to dist/schemas`)
}

await main()
