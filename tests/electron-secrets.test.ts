import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSafeStorageSecrets, type CryptoLike } from '../electron/secrets.js'

const dirs: string[] = []

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdl-sec-'))
  dirs.push(dir)
  return join(dir, '.sdl-secrets.json')
}

function crypto(available = true): CryptoLike {
  return {
    isAvailable: () => available,
    encryptString: (value) => Buffer.from(`enc:${value}`),
    decryptString: (value) => value.toString().replace(/^enc:/, ''),
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('桌面端密钥加密', () => {
  it('写入后文件是密文，读回一致', () => {
    const file = tempFile()
    const store = createSafeStorageSecrets(file, crypto())

    store.write({ deepseek: 'sk-test-1234' })

    expect(store.read()).toEqual({ deepseek: 'sk-test-1234' })
    const raw = readFileSync(file, 'utf8')
    expect(raw).toContain('"encrypted": true')
    expect(raw).not.toContain('sk-test-1234')
    expect(store.isEncryptedFile()).toBe(true)
  })

  it('旧明文自动迁移为密文', () => {
    const file = tempFile()
    writeFileSync(file, JSON.stringify({ deepseek: 'sk-old-9999' }))
    const store = createSafeStorageSecrets(file, crypto())

    expect(store.read()).toEqual({ deepseek: 'sk-old-9999' })
    expect(store.isEncryptedFile()).toBe(true)
    expect(readFileSync(file, 'utf8')).not.toContain('sk-old-9999')
  })

  it('系统密钥链不可用时降级明文并警告', () => {
    const file = tempFile()
    const warnings: string[] = []
    const store = createSafeStorageSecrets(file, crypto(false), (message) => warnings.push(message))

    store.write({ tavily: 'tvly-test' })

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ tavily: 'tvly-test' })
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('清空字段会从文件里删除', () => {
    const file = tempFile()
    const store = createSafeStorageSecrets(file, crypto())
    store.write({ deepseek: 'sk-a', tavily: 'tvly-b' })

    store.write({ deepseek: null })

    expect(store.read()).toEqual({ tavily: 'tvly-b' })
  })
})
