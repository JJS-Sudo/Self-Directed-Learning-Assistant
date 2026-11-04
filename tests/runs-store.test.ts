import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, writeFileSync } from 'node:fs'
import { appendRun, costOf, readRuns, runsFilePath } from '../src/runs/store.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(): string {
  const root = createEmptyVault()
  dirs.push(root)
  return root
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('运行记录', () => {
  it('追加后能读回，顺序不变', () => {
    const root = setup()

    appendRun(root, {
      at: '2026-11-01T10:00:00Z',
      goalId: 'g1',
      kind: '地图',
      ok: true,
      costCny: 0.01,
    })
    appendRun(root, {
      at: '2026-11-01T10:01:00Z',
      goalId: 'g2',
      kind: '路径',
      ok: false,
      error: 'boom',
    })

    const runs = readRuns(root)
    expect(runs).toHaveLength(2)
    expect(runs[1]).toMatchObject({ goalId: 'g2', ok: false, error: 'boom' })
  })

  it('文件损坏：返回空数组并留下 .bak', () => {
    const root = setup()
    writeFileSync(runsFilePath(root), 'not json', 'utf8')

    expect(readRuns(root)).toEqual([])
    expect(existsSync(`${runsFilePath(root)}.bak`)).toBe(true)
  })
})

describe('费用换算', () => {
  it('按价格表算真实 usage', () => {
    const cost = costOf({ promptTokens: 1000, completionTokens: 500 }, {
      SDL_LLM_PRICE_INPUT_PER_M: '2',
      SDL_LLM_PRICE_OUTPUT_PER_M: '8',
    } as NodeJS.ProcessEnv)

    // 1000/1e6*2 + 500/1e6*8 = 0.006
    expect(cost).toBe(0.006)
  })

  it('没有 usage 时不编数字', () => {
    expect(costOf(undefined)).toBeUndefined()
    expect(costOf({})).toBeUndefined()
  })
})
