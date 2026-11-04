import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { formatZodError, toGoalListItem } from '../src/api/goals.js'
import { chunkSizeFromEnv, toMapNodeDto } from '../src/api/map.js'
import type { GoalSummary } from '../src/domain/goals.js'
import type { MapNodeSummary } from '../src/domain/nodes.js'

const goal: GoalSummary = {
  id: 'g0a1b2',
  title: '掌握一元线性回归',
  status: '在用',
  kind: '激励性',
  deadline: '2026-11-05',
  successCriteria: '能手算 R²',
  relativePath: '10-目标/g0a1b2 x.md',
  createdAt: '2026-10-01T00:00:00Z',
}

describe('目标 DTO', () => {
  it('有期限时按本地日算剩余天数', () => {
    const item = toGoalListItem(goal, '2026-11-01')

    expect(item.daysLeft).toBe(4)
    expect(item.deadline).toBe('2026-11-05')
  })

  it('逾期给负数', () => {
    expect(toGoalListItem(goal, '2026-11-08').daysLeft).toBe(-3)
  })

  it('无期限时不带 deadline / daysLeft 字段', () => {
    const item = toGoalListItem({ ...goal, kind: '常规', deadline: undefined }, '2026-11-01')

    expect(item).not.toHaveProperty('deadline')
    expect(item).not.toHaveProperty('daysLeft')
  })

  it('成功判据原样带出', () => {
    expect(toGoalListItem(goal, '2026-11-01').successCriteria).toBe('能手算 R²')
  })
})

describe('zod 错误格式化', () => {
  it('多个字段的错误按「字段：原因」合并', () => {
    const schema = z.object({
      title: z.string().min(1, '不能为空'),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '必须是 YYYY-MM-DD'),
    })
    const parsed = schema.safeParse({ title: '', deadline: '2026/11/01' })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      expect(message).toContain('title：不能为空')
      expect(message).toContain('deadline：必须是 YYYY-MM-DD')
    }
  })

  it('根级错误没有字段前缀', () => {
    const parsed = z.object({}).strict().safeParse({ extra: 1 })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(formatZodError(parsed.error)).not.toMatch(/^：/)
    }
  })
})

describe('地图配置与 DTO', () => {
  it('chunkSizeFromEnv 的默认与边界', () => {
    expect(chunkSizeFromEnv({})).toBe(8)
    expect(chunkSizeFromEnv({ SDL_MAP_CHUNK_SECTIONS: '4' })).toBe(4)
    expect(chunkSizeFromEnv({ SDL_MAP_CHUNK_SECTIONS: '3.9' })).toBe(3)
    expect(chunkSizeFromEnv({ SDL_MAP_CHUNK_SECTIONS: '0' })).toBe(8)
    expect(chunkSizeFromEnv({ SDL_MAP_CHUNK_SECTIONS: '-2' })).toBe(8)
    expect(chunkSizeFromEnv({ SDL_MAP_CHUNK_SECTIONS: 'abc' })).toBe(8)
  })

  it('toMapNodeDto 只在有父节点时带 upId', () => {
    const base: MapNodeSummary = {
      id: 'n1',
      title: '节点',
      order: 1,
      mastery: '未学',
      status: '在用',
      relatedIds: [],
      links: [],
      relativePath: 'x.md',
      createdAt: '2026-10-01T00:00:00Z',
    }

    expect(toMapNodeDto(base)).not.toHaveProperty('upId')
    expect(toMapNodeDto({ ...base, upId: 'n0' }).upId).toBe('n0')
  })
})
