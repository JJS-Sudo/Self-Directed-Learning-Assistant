import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { recordSession } from '../src/domain/assessments.js'
import { loadChain } from '../src/domain/chain.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createStage } from '../src/domain/path-stages.js'
import { createQuestion } from '../src/domain/questions.js'
import { createResource } from '../src/domain/resources.js'
import { createRetrospective } from '../src/domain/retrospectives.js'
import { createEmptyVault, removeDir, vaultErrorCode } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

describe('TG8 · 完整链条一次查出', () => {
  it('端到端：目标 → 知识网 → 学习路径 → 资源 / 验收 → 复盘 → 回写 → 重新拉取', () => {
    const vault = track(createEmptyVault())
    // 库根的非受管笔记：不该混进链条
    writeFileSync(join(vault, '欢迎.md'), '# 欢迎\n\n用户自己的笔记。\n', 'utf8')

    const goal = createGoal({
      root: vault,
      title: '三天完成人生第一个软件设计',
      kind: '激励性',
      deadline: '2026-10-11',
      today: '2026-10-08',
    })
    expect(goal.daysLeft).toBe(3)

    const first = createNode({ root: vault, title: '想清楚要做什么', goal: goal.id })
    const second = createNode({ root: vault, title: '写出来跑起来', goal: goal.id, up: first.id })

    const question = createQuestion({
      root: vault,
      goal: goal.id,
      title: '一句话说清你要做的软件',
      kind: '封闭',
      stem: '能不能用一句话说清它替谁解决了什么问题？',
      answer: '能，且没有技术名词',
      explanation: '出现技术名词就说明还没想清楚。',
      node: first.id,
    })

    const stage = createStage({
      root: vault,
      goal: goal.id,
      title: '第一天：把想法变成一句话',
      estimate: '约 0.5 天',
      deliverable: '一句话描述 + 三个功能 + 一个不做',
      nodes: [first.id],
      checks: ['那句话里没有技术名词', '能说出这次不做什么'],
      questions: [question.id],
    })

    const resource = createResource({
      root: vault,
      title: '如何写好一句话产品描述',
      node: first.id,
      media: '文字',
      level: '入门',
      durationMin: 20,
    })

    const session = recordSession({
      root: vault,
      node: first.id,
      date: '2026-10-09',
      recital: { text: '先想清问题，再想实现。', result: '已完成' },
      quiz: { question: question.id, result: '未作答' },
    })
    const recital = session.assessments.find((item) => item.mode === '复述')
    expect(recital).toBeDefined()

    const retrospective = createRetrospective({
      root: vault,
      assessment: recital?.id ?? '',
      worked: '先复述再动手，避免直接开写。',
      failed: '第一版把实现方式当成了问题描述。',
      nextAdjustment: '第二天先做能点的最小版本。',
      adjustEvents: [stage.id],
      mastery: '在学',
    })

    const chain = loadChain(vault, goal.id)

    expect(chain.goal.id).toBe(goal.id)
    expect(chain.goal.deadline).toBe('2026-10-11')
    expect(chain.nodes.map((node) => node.id)).toEqual([first.id, second.id])
    expect(chain.nodes.find((node) => node.id === first.id)?.mastery).toBe('在学')
    expect(chain.stages.map((item) => item.id)).toEqual([stage.id])
    expect(chain.stages[0]?.checks).toHaveLength(2)
    expect(chain.resources.map((item) => item.id)).toEqual([resource.id])
    expect(chain.assessments).toHaveLength(2)
    expect(chain.retrospectives.map((item) => item.id)).toEqual([retrospective.id])
    expect(chain.retrospectives[0]?.adjustEventIds).toEqual([stage.id])
  })

  it('只返回该目标的链条；未知目标报 NOT_FOUND', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: 'A' })
    const other = createGoal({ root: vault, title: 'B' })
    const node = createNode({ root: vault, title: 'A 的节点', goal: goal.id })
    const otherNode = createNode({ root: vault, title: 'B 的节点', goal: other.id })

    createStage({
      root: vault,
      goal: goal.id,
      title: 'A 的段',
      estimate: '约 1 天',
      nodes: [node.id],
      checks: ['A 的检验信号'],
    })
    createStage({
      root: vault,
      goal: other.id,
      title: 'B 的段',
      estimate: '约 2 天',
      nodes: [otherNode.id],
      checks: ['B 的检验信号'],
    })
    createResource({ root: vault, title: 'A 的资源', node: node.id, media: '文字', level: '入门' })

    const chain = loadChain(vault, goal.id)
    expect(chain.stages.map((item) => item.title)).toEqual(['A 的段'])
    expect(chain.resources.map((item) => item.title)).toEqual(['A 的资源'])
    expect(vaultErrorCode(() => loadChain(vault, 'nope'))).toBe('NOT_FOUND')
  })
})
