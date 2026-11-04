import { z } from 'zod'
import { maskKey, readKeys, type SecretsBackend, type StoredKeys } from '../settings/keys.js'
import type { KeyStatusDto, KeysViewDto } from '../shared/settings.js'

export const updateKeysSchema = z.object({
  deepseek: z.string().trim().min(1).max(200).nullable().optional(),
  tavily: z.string().trim().min(1).max(200).nullable().optional(),
})

export function keysView(
  root: string,
  base: NodeJS.ProcessEnv = process.env,
  backend?: SecretsBackend,
): KeysViewDto {
  const stored = backend === undefined ? readKeys(root) : backend.read()

  const status = (envName: string, storedKey: string | undefined): KeyStatusDto => {
    const envValue = (base[envName] ?? '').trim()
    if (envValue !== '') return { configured: true, mask: maskKey(envValue), source: 'env' }
    if (storedKey !== undefined) {
      return { configured: true, mask: maskKey(storedKey), source: 'page' }
    }
    return { configured: false }
  }

  return {
    deepseek: status('DEEPSEEK_API_KEY', stored.deepseek),
    tavily: status('TAVILY_API_KEY', stored.tavily),
  }
}

export function keysToStored(keys: StoredKeys): StoredKeys {
  return { ...keys }
}
