import { describe, expect, it } from 'vitest'
import type { GoalSummary } from '../src/domain/goals.js'
import { generateCandidates } from '../src/map-gen/generate.js'
import { completion, fakeFetch, jsonResponse, testConfig } from './llm-fixtures.js'

const goal: GoalSummary = {
  id: 'g1',
  title: '掌握一元线性回归',
  status: '在用',
  kind: '常规',
  successCriteria: '能不看笔记手算一遍 R²',
  relativePath: '10-目标/g1 掌握一元线性回归.md',
  createdAt: '2026-01-01T00:00:00Z',
}

const material = ['第一章 模型', '1.1 总体回归', '1.2 样本回归'].join('\n')

describe('生成候选', () => {
  it('按块调用：3 节 / 每块 2 → 2 次请求，候选合并后有父子关系', async () => {
    const { fetch, calls } = fakeFetch((_call, index) =>
      jsonResponse(
        completion(
          index === 0
            ? '{"nodes":[{"temp_id":"n1","title":"模型"},{"temp_id":"n2","title":"总体回归","parent_temp_id":"n1"}]}'
            : '{"nodes":[{"temp_id":"n1","title":"样本回归"}]}',
        ),
      ),
    )

    const result = await generateCandidates(
      testConfig(),
      goal,
      material,
      { chunkSections: 2 },
      { fetch },
    )

    expect(calls).toHaveLength(2)
    expect(result.chunks).toBe(2)
    expect(result.candidates.map((item) => item.title)).toEqual(['模型', '总体回归', '样本回归'])
    expect(result.candidates.find((item) => item.title === '总体回归')?.parentTempId).toBe('1-n1')
  })

  it('第一块坏 JSON 时修复一次后成功', async () => {
    const { fetch, calls } = fakeFetch((_call, index) =>
      jsonResponse(
        completion(
          index === 0 ? '{"nodes":"oops"}' : '{"nodes":[{"temp_id":"n1","title":"模型"}]}',
        ),
      ),
    )

    const result = await generateCandidates(testConfig(), goal, '第一章', {}, { fetch })

    expect(calls).toHaveLength(2)
    expect(result.candidates.map((item) => item.title)).toEqual(['模型'])
  })

  it('材料为空时不发请求', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))

    await expect(
      generateCandidates(testConfig(), goal, '   ', {}, { fetch }),
    ).rejects.toMatchObject({
      code: 'LLM_BAD_INPUT',
    })
    expect(calls).toHaveLength(0)
  })

  it('没有 key 时不发请求', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))

    await expect(
      generateCandidates(testConfig({ apiKey: '' }), goal, '第一章', {}, { fetch }),
    ).rejects.toMatchObject({ code: 'LLM_NOT_CONFIGURED' })
    expect(calls).toHaveLength(0)
  })
})
