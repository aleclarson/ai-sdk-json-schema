// @ts-nocheck

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { $ } from 'bun'

import {
  createGeneratedCatalogFromProvidersDir,
  renderCatalogModule,
} from '../src/internal/generate-catalog'

const OWNER = 'anomalyco'
const REPO = 'models.dev'

function parseArgs(argv: string[]) {
  let since: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: bun scripts/generate.ts [--since YYYY-MM-DD]')
      process.exit(0)
    }

    if (arg === '--since') {
      since = argv[index + 1]

      if (!since) {
        throw new Error('Missing value for --since')
      }

      index += 1
      continue
    }

    if (arg.startsWith('--since=')) {
      since = arg.slice('--since='.length)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    since,
  }
}

async function main() {
  const { since } = parseArgs(process.argv.slice(2))
  const repoResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`)

  if (!repoResponse.ok) {
    throw new Error(`Failed to fetch repo metadata: ${repoResponse.status}`)
  }

  const repo = await repoResponse.json()
  const ref = repo.default_branch ?? 'dev'
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'models-dev-'))

  try {
    const archiveUrl = `https://codeload.github.com/${OWNER}/${REPO}/tar.gz/refs/heads/${ref}`

    await $`curl -L --silent ${archiveUrl} | tar -xzf - -C ${tempDir}`

    const [archiveRoot] = await fs.readdir(tempDir)

    if (!archiveRoot) {
      throw new Error('Downloaded archive was empty')
    }

    const catalog = createGeneratedCatalogFromProvidersDir({
      providersDir: path.join(tempDir, archiveRoot, 'providers'),
      generatedAt: new Date().toISOString(),
      ref,
      since,
      parseToml(source) {
        return Bun.TOML.parse(source)
      },
    })

    const outputPath = path.join(import.meta.dir, '..', 'src', 'generated', 'catalog.ts')

    await fs.writeFile(
      outputPath,
      renderCatalogModule(catalog, {
        since,
      }),
    )

    console.log(
      `Generated ${Object.keys(catalog.providers).length} providers and ${catalog.packageNames.length} package identifiers from ${OWNER}/${REPO}@${ref}${since ? ` since ${since}` : ''}`,
    )
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    })
  }
}

await main()
