import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  InvalidProviderModuleError,
  MissingProviderPackageError,
  MissingTemplateVariableError,
} from '../errors'
import type {
  ResolvedTextModelModule,
  TextModelModulePlan,
} from '../types'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function mergeUnknown(baseValue: unknown, overrideValue: unknown): unknown {
  if (overrideValue === undefined) {
    return baseValue
  }

  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const result: Record<string, unknown> = { ...baseValue }

    for (const key of Object.keys(overrideValue)) {
      result[key] = mergeUnknown(result[key], overrideValue[key])
    }

    return result
  }

  return overrideValue
}

export function mergeOptions(
  baseValue: Record<string, unknown> | undefined,
  overrideValue: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const merged = mergeUnknown(baseValue, overrideValue)
  return isPlainObject(merged) ? merged : undefined
}

export function expandTemplate(
  template: string | undefined,
  env: Record<string, string | undefined> | undefined,
): string | undefined {
  if (template === undefined) {
    return undefined
  }

  const source = env ?? process.env

  return template.replaceAll(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const value = source[name]

    if (value === undefined) {
      throw new MissingTemplateVariableError(name, template)
    }

    return value
  })
}

export function resolveModulePlans(
  installationRoot: string,
  modules: TextModelModulePlan[],
): ResolvedTextModelModule[] {
  const anchorPath = path.join(installationRoot, 'package.json')
  const require = createRequire(anchorPath)

  return modules.map((modulePlan) => {
    try {
      const resolvedPath = require.resolve(modulePlan.specifier)

      return {
        role: modulePlan.role,
        specifier: modulePlan.specifier,
        packageName: modulePlan.packageName,
        resolvedPath,
        fileUrl: pathToFileURL(resolvedPath).href,
        exportName: modulePlan.exportName,
      }
    } catch (error) {
      throw new MissingProviderPackageError({
        packageName: modulePlan.packageName,
        specifier: modulePlan.specifier,
        installationRoot,
        cause: error,
      })
    }
  })
}

export async function loadModuleExports(
  modulePlan: ResolvedTextModelModule,
): Promise<Record<string, unknown>> {
  const loaded = await import(modulePlan.fileUrl)

  if (modulePlan.exportName in loaded) {
    return loaded as Record<string, unknown>
  }

  const require = createRequire(import.meta.url)
  const required = require(modulePlan.resolvedPath)

  if (required && typeof required === 'object' && modulePlan.exportName in required) {
    return required as Record<string, unknown>
  }

  if (
    required &&
    typeof required === 'object' &&
    'default' in required &&
    required.default &&
    typeof required.default === 'object' &&
    modulePlan.exportName in required.default
  ) {
    return required.default as Record<string, unknown>
  }

  throw new InvalidProviderModuleError({
    specifier: modulePlan.specifier,
    resolvedPath: modulePlan.resolvedPath,
    exportName: modulePlan.exportName,
  })
}
