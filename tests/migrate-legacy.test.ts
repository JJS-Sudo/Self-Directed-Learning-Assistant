import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planMigration, runMigration, STAGE_CHECK_PLACEHOLDER } from '../src/migrate/legacy.js'
import { parseDocument } from '../src/vault/document.js'
import { writeDocument } from '../src/vault/io.js'
import { createEmptyVault, relativeFileList, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

function goalFrontmatter() {
  return { status: '在用' }
}

/** 造一个**旧结构**的库：目标与实体都在平铺目录里，且没有 kind / path-stage */
function legacyVault(): { vault: string; goalId: string; nodeId: string; eventId: string } {
  const vault = track(createEmptyVault())
  const goal = writeDocument({
    root: vault,
    dir: '10-目标',
    type: 'goal',
    title: '精通 TypeScript 类型系统',
    frontmatter: goalFrontmatter(),
  })
  const goalId = String(goal.data['id'])

  const node = writeDocument({
    root: vault,
    dir: '20-知识网',
    type: 'map-node',
    title: '类型基础',
    frontmatter: {
      goal: `[[${goalId} 精通 TypeScript 类型系统|精通 TypeScript 类型系统]]`,
      order: 1,
      mastery: '未学',
      status: '在用',
    },
  })
  const nodeId = String(node.data['id'])

  const event = writeDocument({
    root: vault,
    dir: '30-路径',
    type: 'path-event',
    title: '精读《类型基础》',
    frontmatter: {
      goal: `[[${goalId} 精通 TypeScript 类型系统|精通 TypeScript 类型系统]]`,
      node: `[[${nodeId} 类型基础|类型基础]]`,
      date: '2026-09-29',
      duration_min: 60,
      order: 1,
      status: '在用',
    },
  })

  // 第二个事件在更晚的日期，旧 `order` 又是从 1 开始 —— 迁移必须把它重排成全程段序 1,2
  writeDocument({
    root: vault,
    dir: '30-路径',
    type: 'path-event',
    title: '练习泛型约束',
    frontmatter: {
      goal: `[[${goalId} 精通 TypeScript 类型系统|精通 TypeScript 类型系统]]`,
      node: `[[${nodeId} 类型基础|类型基础]]`,
      date: '2026-09-30',
      duration_min: 90,
      order: 1,
      status: '在用',
    },
  })

  // 旧题目没有 goal 字段（要靠 node 推）
  writeDocument({
    root: vault,
    dir: '50-题目',
    type: 'question',
    title: '等价吗',
    frontmatter: {
      kind: '封闭',
      stem: 's',
      answer: 'a',
      node: `[[${nodeId} 类型基础|类型基础]]`,
      status: '在用',
    },
    body: '解析全文',
  })

  // 无法归属的文件（没有 goal / node）
  writeDocument({
    root: vault,
    dir: '60-验收',
    type: 'assessment',
    title: '孤儿验收',
    frontmatter: { session_id: 's1', date: '2026-09-29', mode: '复述', result: '已完成' },
  })

  return { vault, goalId, nodeId, eventId: String(event.data['id']) }
}

describe('TG8 · 一次性迁移', () => {
  it('试跑不改任何文件，并给出计划', () => {
    const { vault } = legacyVault()
    const before = relativeFileList(vault)

    const result = runMigration(vault, { dryRun: true })

    expect(relativeFileList(vault)).toEqual(before)
    expect(result.moved).toBe(0)
    expect(result.plan.moves.length).toBe(4)
    expect(result.plan.unattributable).toHaveLength(1)
    expect(result.plan.goals.filter((goal) => goal.needsKind)).toHaveLength(1)
    // 段序在计划里就重排好了：1、2（而不是两个 1）
    expect(
      result.plan.moves
        .filter((move) => move.legacyType === 'path-event')
        .map((move) => move.stageOrder)
        .sort(),
    ).toEqual([1, 2])
  })

  it('正式迁移：文件数守恒、字段映射正确、归属不明的留在原处', () => {
    const { vault, goalId, nodeId, eventId } = legacyVault()
    const before = relativeFileList(vault)

    const result = runMigration(vault)

    expect(result.filesAfter).toBe(result.filesBefore)
    const after = relativeFileList(vault)
    expect(after).toHaveLength(before.length)

    // 目标补了 kind
    const goalRaw = readFileSync(
      join(vault, `10-目标/${goalId} 精通 TypeScript 类型系统.md`),
      'utf8',
    )
    expect(parseDocument(goalRaw).data['kind']).toBe('常规')

    // 路径事件 → 路径段
    const stagePath = after.find((file) => file.includes('学习路径/') && file.includes(eventId))
    expect(stagePath).toBeDefined()
    const stage = parseDocument(readFileSync(join(vault, stagePath as string), 'utf8'))
    expect(stage.data['type']).toBe('path-stage')
    expect(stage.data['estimate']).toBe('约 60 分钟')
    expect(stage.data['date']).toBe('2026-09-29')
    expect(stage.data['checks']).toEqual([STAGE_CHECK_PLACEHOLDER])
    expect(stage.data['nodes']).toEqual([`[[${nodeId} 类型基础|类型基础]]`])
    expect(stage.data['order']).toBe(1)

    // 第二个事件排在后面（全程段序）
    const secondStagePath = after.find(
      (file) => file.includes('学习路径/') && file.includes('练习泛型约束'),
    )
    expect(secondStagePath).toBeDefined()
    expect(
      parseDocument(readFileSync(join(vault, secondStagePath as string), 'utf8')).data['order'],
    ).toBe(2)

    // 题目搬到分区并补上 goal
    const questionPath = after.find((file) => file.includes('验收/') && file.includes('等价吗'))
    expect(questionPath).toBeDefined()
    const question = parseDocument(readFileSync(join(vault, questionPath as string), 'utf8'))
    expect(question.data['goal']).toContain(goalId)

    // 归属不明的仍在原处（不丢文件，也不硬塞）
    expect(after.some((file) => file.includes('60-验收/') && file.includes('孤儿验收'))).toBe(true)
    expect(result.plan.unattributable[0]?.relativePath).toContain('孤儿验收')
  })

  it('迁移是幂等的：再跑一次没有可搬的东西', () => {
    const { vault } = legacyVault()
    runMigration(vault)

    const again = planMigration(vault)
    expect(again.moves).toHaveLength(0)
    expect(again.goals.filter((goal) => goal.needsKind)).toHaveLength(0)
  })

  it('旧目录里放错类型的文件不会被硬猜归属', () => {
    const { vault } = legacyVault()
    // 往知识网里放一个 note（type 不是 map-node）
    writeFileSync(
      join(vault, '20-知识网', '随手笔记.md'),
      '---\ntitle: 笔记\n---\n\n没有 id/type。\n',
      'utf8',
    )

    const plan = planMigration(vault)
    expect(plan.unattributable.some((item) => item.relativePath.includes('随手笔记'))).toBe(true)
  })
})
