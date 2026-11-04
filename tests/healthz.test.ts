import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createTempVault, makeTempDir, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

describe('GET /healthz', () => {
  it('返回 200，且响应体可被 JSON.parse 解析', async () => {
    const app = createApp({ vaultPath: join(track(makeTempDir('sdl-healthz-')), 'vault') })
    const response = await app.request('/healthz')

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('报告库存在且带标记', async () => {
    const vault = track(createTempVault())
    const response = await createApp({ vaultPath: vault }).request('/healthz')
    const body = (await response.json()) as {
      ok: boolean
      vault: { exists: boolean; marked: boolean }
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.vault.exists).toBe(true)
    expect(body.vault.marked).toBe(true)
  })
})
