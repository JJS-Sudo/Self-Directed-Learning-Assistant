import { existsSync, statSync } from 'node:fs'
import { bootstrapVaultIfEmpty } from '../src/vault/bootstrap.js'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import matter from 'gray-matter'
import { Hono } from 'hono'

/**
 * 环境自检：不测业务逻辑，只证明这套技术栈真的能跑起来。
 * 覆盖三件事：依赖可用性（gray-matter 解析 frontmatter、Hono 返回 JSON）、
 * 「日期必须加引号」这条约定的理由、以及 `.sdlrc.json` 指向的库真实可用。
 */

describe('依赖可用性', () => {
  it('gray-matter 能在 ESM + NodeNext 下解析 frontmatter', () => {
    const raw = ['---', 'id: t1', 'type: goal', '---', '# 标题', '', '正文'].join('\n')
    const parsed = matter(raw)

    expect(parsed.data.id).toBe('t1')
    expect(parsed.data.type).toBe('goal')
    expect(parsed.content).toContain('# 标题')
  })

  it('Hono 能在进程内返回 JSON —— roadmap P1-1 的形状', async () => {
    const app = new Hono()
    app.get('/healthz', (c) => c.json({ ok: true }))

    const res = await app.request('/healthz')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})

describe('Conventions 中"日期必须加引号"的理由', () => {
  it('加引号保持字符串；不加引号会被 YAML 解析成 Date 对象', () => {
    const quoted = matter('---\ndate: "2026-09-29"\n---\n').data.date
    const bare = matter('---\ndate: 2026-09-29\n---\n').data.date

    expect(typeof quoted).toBe('string')
    expect(bare).toBeInstanceOf(Date)
  })
})

describe('配置', () => {
  it('.sdlrc.json 指向一个真实存在、且带 .sdl-vault 标记的库', async () => {
    const { default: config } = await import('../.sdlrc.json', { with: { type: 'json' } })
    expect(config.vaultPath).toBe('./vault')

    const vaultDir = join(import.meta.dirname, '..', config.vaultPath)
    if (!existsSync(vaultDir)) {
      const seeds = join(import.meta.dirname, '..', 'seeds')
      expect(bootstrapVaultIfEmpty(vaultDir, seeds).created).toBe(true)
    }

    expect(statSync(vaultDir).isDirectory()).toBe(true)
    expect(existsSync(join(vaultDir, '.sdl-vault'))).toBe(true)
  })
})
