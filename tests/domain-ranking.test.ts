import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { readProfile, writeProfile } from '../src/domain/profile.js'
import { rankResources, rankReasonOf, scoreOf, type Rankable } from '../src/domain/ranking.js'
import { applyRanking, createResource, listResources } from '../src/domain/resources.js'
import { readDocument } from '../src/vault/io.js'
import { createEmptyVault, createTempVault, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

const PROFILE = {
  id: 'p1',
  level: '入门',
  mediaPreference: '文字',
  timeBudget: 1,
  relativePath: '00-配置/profile.md',
}

/** 黄金用例的固定输入：分数分别 6 / 3 / 3 / 0 / 0 */
const GOLDEN: Rankable[] = [
  { id: 'a', level: '入门', media: '文字', durationMin: 30, createdAt: '2026-01-05' },
  { id: 'b', level: '入门', media: '视频', durationMin: 120, createdAt: '2026-01-02' },
  { id: 'c', level: '进阶', media: '文字', durationMin: 45, createdAt: '2026-01-01' },
  { id: 'd', level: '进阶', media: '视频', createdAt: '2026-01-03' },
  { id: 'e', level: '进阶', media: '视频', createdAt: '2026-01-03' },
]

describe('TG4 · 三因子加权的打分', () => {
  it('水平命中 +3、媒介命中 +2、时长不超预算 +1', () => {
    expect(scoreOf(PROFILE, GOLDEN[0]!)).toBe(6)
    expect(scoreOf(PROFILE, GOLDEN[1]!)).toBe(3)
    expect(scoreOf(PROFILE, GOLDEN[2]!)).toBe(3)
    expect(scoreOf(PROFILE, GOLDEN[3]!)).toBe(0)
  })

  it('时长超过预算（time_budget 小时 × 60）时该因子记 0，理由里写出比较式', () => {
    const reason = rankReasonOf(PROFILE, {
      id: 'x',
      level: '入门',
      media: '文字',
      durationMin: 120,
    })
    expect(reason).toContain('时长 +0（120 > 60 分钟）')
  })

  it('缺 duration_min 时写「时长未知」，而不是静默记 0', () => {
    const reason = rankReasonOf(PROFILE, { id: 'x', level: '入门', media: '文字' })
    expect(reason).toContain('时长未知 +0（缺 duration_min）')
  })

  it('画像媒介偏好为「不限」时两类都命中 +2', () => {
    const profile = { ...PROFILE, mediaPreference: '不限' }
    expect(rankReasonOf(profile, { id: 'x', media: '文字' })).toContain('媒介偏好 +2')
    expect(rankReasonOf(profile, { id: 'y', media: '视频' })).toContain('媒介偏好 +2')
  })

  it('每条理由都非空，且含被采纳的因子名与取值（roadmap P3-6）', () => {
    for (const item of GOLDEN) {
      const reason = rankReasonOf(PROFILE, item)
      expect(reason).not.toBe('')
      expect(reason).toContain('水平匹配 +')
      expect(reason).toContain('媒介偏好 +')
    }
  })
})

describe('TG4 · 排序的确定性与黄金用例', () => {
  it('同一输入两次调用，返回顺序逐项完全相同', () => {
    const first = rankResources(PROFILE, GOLDEN).map((entry) => entry.item.id)
    const second = rankResources(PROFILE, GOLDEN).map((entry) => entry.item.id)
    expect(first).toEqual(second)
  })

  it('打乱输入顺序后结果不变（不依赖输入顺序）', () => {
    const shuffled = [...GOLDEN].reverse()
    expect(rankResources(PROFILE, shuffled).map((entry) => entry.item.id)).toEqual(
      rankResources(PROFILE, GOLDEN).map((entry) => entry.item.id),
    )
  })

  it('黄金用例：固化的期望顺序，而不只是"两次一样"', () => {
    // 6 → a；3 分并列按 created_at 升序 → c(01-01) 先于 b(01-02)；
    // 0 分并列且 created_at 相同 → 按 id 升序 → d 先于 e
    expect(rankResources(PROFILE, GOLDEN).map((entry) => entry.item.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
      'e',
    ])
  })
})

describe('TG4 · 与真实库的配合', () => {
  it('种子库的自述排序成立：视频资源排在文字手册之前', () => {
    const vault = track(createTempVault())
    const ranked = rankResources(readProfile(vault), listResources(vault))
    expect(ranked.map((entry) => entry.item.title)).toEqual([
      '泛型入门讲解（视频）',
      'TypeScript 官方手册 · 泛型',
    ])
  })

  it('种子库里存的 rank_reason 与实现算出的理由逐字一致（种子不会静默腐烂）', () => {
    const vault = track(createTempVault())
    const profile = readProfile(vault)
    const resources = listResources(vault)

    expect(resources.length).toBeGreaterThanOrEqual(2)
    for (const resource of resources) {
      expect(resource.rankReason, resource.title).toBe(rankReasonOf(profile, resource))
    }
  })

  it('applyRanking 把算出的理由落盘（改画像后重新生成）', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '目标' })
    const node = createNode({ root: vault, title: '泛型', goal: goal.id })

    writeProfile(vault, { level: '入门', mediaPreference: '视频', timeBudget: 1 })
    const resource = createResource({
      root: vault,
      title: '资源',
      node: node.id,
      media: '文字',
      level: '入门',
      durationMin: 30,
    })

    const before = String(readDocument(vault, resource.relativePath).data['rank_reason'])
    expect(before).toContain('媒介偏好 +0')

    // 画像改成偏好文字 → 重新排序后落盘的理由必须跟着变
    writeProfile(vault, { mediaPreference: '文字' })
    const ranked = applyRanking(vault)
    const after = String(readDocument(vault, resource.relativePath).data['rank_reason'])

    expect(after).toContain('媒介偏好 +2')
    expect(ranked[0]?.rankReason).toBe(after)
    expect(before).not.toBe(after)
  })
})
