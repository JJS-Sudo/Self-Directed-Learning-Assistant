import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { listNodes } from '../src/domain/nodes.js'
import { generateCandidates } from '../src/map-gen/generate.js'
import { persistCandidates } from '../src/map-gen/persist.js'
import type { GoalSummary } from '../src/domain/goals.js'
import { completion, fakeFetch, jsonResponse, testConfig } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'
import { sanitizeFileName } from '../src/vault/document.js'

const dirs: string[] = []

function setup(): { root: string; goalId: string } {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '边界测试目标' })
  return { root, goalId: goal.id }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('落盘的防御性边界', () => {
  it('候选互相引用成环时不会死循环，两个都会落盘', () => {
    const { root, goalId } = setup()

    const result = persistCandidates(root, goalId, [
      { tempId: 'a', title: 'A', parentTempId: 'b' },
      { tempId: 'b', title: 'B', parentTempId: 'a' },
    ])

    expect(result.created).toBe(2)
    expect(listNodes(root, goalId)).toHaveLength(2)
  })

  it('清洗后才重名的标题也会加后缀（a/b 与 a:b 都变成 a_b）', () => {
    const { root, goalId } = setup()

    persistCandidates(root, goalId, [
      { tempId: 'a', title: 'a/b' },
      { tempId: 'b', title: 'a:b' },
    ])

    const titles = listNodes(root, goalId).map((node) => node.title)
    expect(new Set(titles)).toEqual(new Set(['a/b', 'a:b（2）']))

    // 真正的约束：落到磁盘后的文件名必须互不冲突
    const sanitized = titles.map((title) => sanitizeFileName(title))
    expect(new Set(sanitized).size).toBe(2)
  })
})

describe('生成顺序', () => {
  it('多块时按块顺序拼接候选', async () => {
    const goal: GoalSummary = {
      id: 'g1',
      title: '目标',
      status: '在用',
      kind: '常规',
      relativePath: '10-目标/g1.md',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const { fetch, calls } = fakeFetch((_call, index) =>
      jsonResponse(completion(`{"nodes":[{"temp_id":"n1","title":"第 ${index + 1} 块"}]}`)),
    )

    const result = await generateCandidates(
      testConfig(),
      goal,
      '一\n二\n三',
      { chunkSections: 1 },
      { fetch },
    )

    expect(calls).toHaveLength(3)
    expect(result.candidates.map((item) => item.title)).toEqual(['第 1 块', '第 2 块', '第 3 块'])
  })
})
