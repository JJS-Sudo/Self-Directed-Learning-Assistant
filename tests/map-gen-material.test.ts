import { describe, expect, it } from 'vitest'
import { estimateCost } from '../src/map-gen/estimate.js'
import { chunkSections, splitSections } from '../src/map-gen/material.js'
import { mergeCandidates } from '../src/map-gen/merge.js'

describe('材料切块', () => {
  it('去掉空行与装饰线', () => {
    const sections = splitSections('  第一章  \n\n---\n1.1 小节\n\n====\n')

    expect(sections).toEqual(['第一章', '1.1 小节'])
  })

  it('每块 8 个，100 节切出 13 块（最后一块 4 节）', () => {
    const sections = Array.from({ length: 100 }, (_, index) => `第 ${index + 1} 节`)
    const chunks = chunkSections(sections, 8)

    expect(chunks).toHaveLength(13)
    expect(chunks[0]).toHaveLength(8)
    expect(chunks.at(-1)).toHaveLength(4)
  })
})

describe('候选合并', () => {
  it('同标题去重，子节点挂到保留者上', () => {
    const merged = mergeCandidates([
      [
        { tempId: 'a', title: '线性回归' },
        { tempId: 'b', title: '最小二乘', parentTempId: 'a' },
      ],
      [
        { tempId: 'a', title: '线性回归' },
        { tempId: 'c', title: 'R²', parentTempId: 'a' },
      ],
    ])

    expect(merged.candidates.map((item) => item.title)).toEqual(['线性回归', '最小二乘', 'R²'])
    const r2 = merged.candidates.find((item) => item.title === 'R²')
    expect(r2?.parentTempId).toBe('1-a')
    expect(merged.warnings.some((warning) => warning.includes('重复标题'))).toBe(true)
  })

  it('跨块悬空的父节点降为顶层', () => {
    const merged = mergeCandidates([
      [{ tempId: 'a', title: '顶层' }],
      [{ tempId: 'b', title: '孤儿', parentTempId: 'not-in-this-chunk' }],
    ])

    const orphan = merged.candidates.find((item) => item.title === '孤儿')
    expect(orphan?.parentTempId).toBeUndefined()
    expect(merged.warnings.some((warning) => warning.includes('降为顶层'))).toBe(true)
  })

  it('模型发明虚拟根 n0 时按顶层处理，不报警告', () => {
    const merged = mergeCandidates([[{ tempId: 'n1', title: '甲', parentTempId: 'n0' }]])

    expect(merged.candidates[0]?.parentTempId).toBeUndefined()
    expect(merged.warnings).toEqual([])
  })

  it('空标题被丢弃并记警告', () => {
    const merged = mergeCandidates([[{ tempId: 'a', title: '   ' }]])

    expect(merged.candidates).toEqual([])
    expect(merged.warnings.some((warning) => warning.includes('空标题'))).toBe(true)
  })
})

describe('成本预估', () => {
  it('按字符与块数估算 token 与费用', () => {
    const estimate = estimateCost('a'.repeat(1_500), {
      chunkSections: 8,
      prices: { inputPerMillionCny: 2, outputPerMillionCny: 8 },
    })

    expect(estimate.sections).toBe(1)
    expect(estimate.chunks).toBe(1)
    expect(estimate.inputTokens).toBe(1_000)
    expect(estimate.outputTokens).toBe(640)
    expect(estimate.costCny).toBeCloseTo(0.00712, 5)
  })
})
