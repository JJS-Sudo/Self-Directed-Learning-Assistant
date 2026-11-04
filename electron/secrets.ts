import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { KeysPatch, SecretsBackend, StoredKeys } from '../src/settings/keys.js'

export interface CryptoLike {
  isAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface EncryptedFile {
  v: 1
  encrypted: true
  data: string
}

export interface SafeStorageSecrets extends SecretsBackend {
  /** 当前文件是否为加密格式（排查用） */
  isEncryptedFile(): boolean
}

function sanitize(raw: Record<string, unknown>): StoredKeys {
  const keys: StoredKeys = {}
  if (typeof raw['deepseek'] === 'string' && raw['deepseek'].trim() !== '') {
    keys.deepseek = raw['deepseek'].trim()
  }
  if (typeof raw['tavily'] === 'string' && raw['tavily'].trim() !== '') {
    keys.tavily = raw['tavily'].trim()
  }
  return keys
}

function applyPatch(current: StoredKeys, patch: KeysPatch): StoredKeys {
  const next: StoredKeys = { ...current }
  for (const field of ['deepseek', 'tavily'] as const) {
    const value = patch[field]
    if (value === undefined) continue
    const trimmed = value === null ? '' : value.trim()
    if (trimmed === '') delete next[field]
    else next[field] = trimmed
  }
  return next
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(path, 0o600)
  } catch {
    /* Windows 上无效，忽略 */
  }
}

/**
 * safeStorage 加密的密钥后端。文件仍是库根的 `.sdl-secrets.json`：
 * - 加密可用：写入 { v:1, encrypted:true, data:base64 }；
 * - 读到旧明文：自动迁移为密文，Key 不丢；
 * - 系统密钥环不可用：降级明文并警告（Web/Docker 的行为保持不变）。
 */
export function createSafeStorageSecrets(
  filePath: string,
  crypto: CryptoLike,
  warn: (message: string) => void = console.warn,
): SafeStorageSecrets {
  const readEncrypted = (data: string): StoredKeys => {
    const decrypted = crypto.decryptString(Buffer.from(data, 'base64'))
    return sanitize(JSON.parse(decrypted) as Record<string, unknown>)
  }

  const persist = (keys: StoredKeys): void => {
    if (!crypto.isAvailable()) {
      warn('[sdl] 系统密钥链不可用，API Key 将以明文保存在本机')
      writeFile(filePath, JSON.stringify(keys, null, 2))
      return
    }
    const payload: EncryptedFile = {
      v: 1,
      encrypted: true,
      data: crypto.encryptString(JSON.stringify(keys)).toString('base64'),
    }
    writeFile(filePath, JSON.stringify(payload, null, 2))
  }

  const read = (): StoredKeys => {
    if (!existsSync(filePath)) return {}
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    } catch {
      return {}
    }

    if (parsed['encrypted'] === true && typeof parsed['data'] === 'string') {
      if (!crypto.isAvailable()) {
        warn('[sdl] 系统密钥链不可用，无法读取加密的 API Key')
        return {}
      }
      try {
        return readEncrypted(parsed['data'])
      } catch {
        warn('[sdl] API Key 解密失败，已忽略')
        return {}
      }
    }

    // 旧明文：趁现在迁移成密文
    const keys = sanitize(parsed)
    if (crypto.isAvailable()) {
      try {
        persist(keys)
      } catch {
        warn('[sdl] API Key 明文迁移到加密格式失败，继续使用明文')
      }
    } else {
      warn('[sdl] 系统密钥链不可用，API Key 将继续以明文保存在本机')
    }
    return keys
  }

  return {
    read,
    write(patch) {
      const next = applyPatch(read(), patch)
      persist(next)
      return next
    },
    isEncryptedFile() {
      if (!existsSync(filePath)) return false
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
        return parsed['encrypted'] === true && typeof parsed['data'] === 'string'
      } catch {
        return false
      }
    },
  }
}
