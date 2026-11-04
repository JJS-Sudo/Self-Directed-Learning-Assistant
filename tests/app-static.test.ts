import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createEmptyVault, makeTempDir, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

/** 造一个「已构建」的前端目录 */
function makeWebRoot(): string {
  const dir = track(makeTempDir('sdl-web-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root">hello-spa</div>', 'utf8')
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("spa")', 'utf8')
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

describe('托管 dist/web（webRoot）', () => {
  it('/ 返回 index.html 而不是旧的目标设定页', async () => {
    const app = createApp({ vaultPath: track(createEmptyVault()), webRoot: makeWebRoot() })
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('hello-spa')
  })

  it('未知的非接口路径回落 index.html（SPA 刷新不 404）', async () => {
    const app = createApp({ vaultPath: track(createEmptyVault()), webRoot: makeWebRoot() })
    const response = await app.request('/goals/abc/map')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('hello-spa')
  })

  it('/api/* 未知路径仍是 JSON 404，不会被 SPA 吞掉', async () => {
    const app = createApp({ vaultPath: track(createEmptyVault()), webRoot: makeWebRoot() })
    const response = await app.request('/api/nope')

    expect(response.status).toBe(404)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('注入 webRoot 时 /resources 也交给 SPA（阶段 2 资源区）', async () => {
    const app = createApp({ vaultPath: track(createEmptyVault()), webRoot: makeWebRoot() })
    const response = await app.request('/resources')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('hello-spa')
  })

  it('/assets/* 能取到构建产物的静态文件', async () => {
    const app = createApp({ vaultPath: track(createEmptyVault()), webRoot: makeWebRoot() })
    const response = await app.request('/assets/app.js')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('console.log')
  })

  it('不传 webRoot 时 / 仍是旧的服务端渲染页', async () => {
    const app = createApp({ vaultPath: track(createEmptyVault()) })
    const response = await app.request('/')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).not.toContain('hello-spa')
    expect(html).toContain('目标')
  })

  it('webRoot 指向的目录没有 index.html 时，退回旧行为而不是 404', async () => {
    const empty = track(makeTempDir('sdl-noindex-'))
    const app = createApp({ vaultPath: track(createEmptyVault()), webRoot: empty })
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('目标')
  })
})
