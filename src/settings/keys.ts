import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SECRETS_FILE = '.sdl-secrets.json'

export interface StoredKeys {
  deepseek?: string
  tavily?: string
}

export interface KeysPatch {
  deepseek?: string | null
  tavily?: string | null
}

/** 密钥后端：Web/Docker 用明文文件，桌面端注入 safeStorage 加密实现 */
export interface SecretsBackend {
  read(): StoredKeys
  write(patch: KeysPatch): StoredKeys
}

export function fileSecretsBackend(root: string): SecretsBackend {
  return {
    read: () => readKeys(root),
    write: (patch) => writeKeys(root, patch),
  }
}

export function secretsPath(root: string): string {
  return join(root, SECRETS_FILE)
}

export function readKeys(root: string): StoredKeys {
  const path = secretsPath(root)
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const keys: StoredKeys = {}
    if (typeof parsed['deepseek'] === 'string' && parsed['deepseek'].trim() !== '') {
      keys.deepseek = parsed['deepseek'].trim()
    }
    if (typeof parsed['tavily'] === 'string' && parsed['tavily'].trim() !== '') {
      keys.tavily = parsed['tavily'].trim()
    }
    return keys
  } catch {
    return {}
  }
}

export function writeKeys(root: string, patch: KeysPatch): StoredKeys {
  const current = readKeys(root)
  const next: StoredKeys = { ...current }
  for (const field of ['deepseek', 'tavily'] as const) {
    const value = patch[field]
    if (value === undefined) continue
    const trimmed = value === null ? '' : value.trim()
    if (trimmed === '') delete next[field]
    else next[field] = trimmed
  }

  const path = secretsPath(root)
  writeFileSync(path, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(path, 0o600)
  } catch {
    // Windows 上 chmod 基本无效；保持文件不在导出包里就够了
  }
  return next
}

/** 只回显尾部 4 位，永远不返回完整 key */
export function maskKey(key: string | undefined): string | undefined {
  if (key === undefined || key === '') return undefined
  if (key.length <= 4) return '••••'
  return `••••${key.slice(-4)}`
}

/**
 * 环境变量优先；环境变量没有时才用页面里保存的 key。
 * 这样部署方设的密钥不会被页面覆盖，页面填的也能立刻生效。
 */
export function effectiveEnv(
  root: string,
  base: NodeJS.ProcessEnv = process.env,
  backend: SecretsBackend = fileSecretsBackend(root),
): NodeJS.ProcessEnv {
  return effectiveEnvFrom(backend.read(), base)
}

export function effectiveEnvFrom(
  keys: StoredKeys,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }

  const envDeepseek = (env['DEEPSEEK_API_KEY'] ?? '').trim()
  if (envDeepseek === '' && keys.deepseek !== undefined) {
    env['DEEPSEEK_API_KEY'] = keys.deepseek
  }

  const envTavily = (env['TAVILY_API_KEY'] ?? '').trim()
  if (envTavily === '' && keys.tavily !== undefined) {
    env['TAVILY_API_KEY'] = keys.tavily
  }

  return env
}
