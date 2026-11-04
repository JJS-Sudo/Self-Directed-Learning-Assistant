import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal, findGoal, listGoals, requireGoal } from '../src/domain/goals.js'
import { parseDocument } from '../src/vault/document.js'
import { createEmptyVault, removeDir, vaultErrorCode } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

function readFrontmatter(vault: string, relativePath: string): Record<string, unknown> {
  return parseDocument(readFileSync(join(vault, relativePath), 'utf8')).data
}

function fileNameOf(relativePath: string): string {
  return relativePath.split(/[\\/]/).pop() ?? ''
}

describe('TG1 · 创建目标', () => {
  it('产出 `{id} {title}.md`，frontmatter 含 id/type/title/created_at/status 五项', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({
      root: vault,
      title: '精通 TypeScript 类型系统',
      successCriteria: '能独立写出工具类型，并解释每一层的推导过程',
    })

    expect(fileNameOf(goal.relativePath)).toBe(`${goal.id} 精通 TypeScript 类型系统.md`)

    const data = readFrontmatter(vault, goal.relativePath)
    for (const field of ['id', 'type', 'title', 'created_at', 'status']) {
      expect(data[field], field).toBeDefined()
    }
    expect(data['type']).toBe('goal')
    expect(data['title']).toBe('精通 TypeScript 类型系统')
    expect(data['status']).toBe('在用')
    expect(data['success_criteria']).toBe('能独立写出工具类型，并解释每一层的推导过程')
    expect(typeof data['created_at']).toBe('string')
    expect(data['schema_version']).toBe(1)
  })

  it('标题含 Windows 非法字符与 `[` `]` 时仍能创建成功，且已被转义', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: 'A/B:C*D?E[F]G' })
    const fileName = fileNameOf(goal.relativePath)

    expect(fileName.endsWith('A_B_C_D_E_F_G.md')).toBe(true)
    expect(fileName.includes('[')).toBe(false)
    expect(fileName.includes(']')).toBe(false)
    expect(fileName.includes('/')).toBe(false)
  })

  it('`success_criteria` 是选填的', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '没有判据的目标' })

    expect(goal.successCriteria).toBeUndefined()
    expect('success_criteria' in readFrontmatter(vault, goal.relativePath)).toBe(false)
  })

  it('listGoals 覆盖全部目标且两次调用顺序一致', () => {
    const vault = track(createEmptyVault())
    const first = createGoal({ root: vault, title: '目标甲' })
    const second = createGoal({ root: vault, title: '目标乙' })

    const once = listGoals(vault)
    const twice = listGoals(vault)

    expect(once.map((goal) => goal.id).sort()).toEqual([first.id, second.id].sort())
    expect(twice.map((goal) => goal.id)).toEqual(once.map((goal) => goal.id))
  })

  it('findGoal / requireGoal', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '可查找的目标' })

    expect(findGoal(vault, goal.id)?.title).toBe('可查找的目标')
    expect(requireGoal(vault, goal.id).id).toBe(goal.id)
    expect(vaultErrorCode(() => requireGoal(vault, 'nosuch'))).toBe('NOT_FOUND')
  })
})

describe('TG2 · 激励性总目标', () => {
  it('激励性目标：期限必填，落盘为字符串', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({
      root: vault,
      title: '三天完成人生第一个软件设计',
      kind: '激励性',
      deadline: '2026-10-11',
      today: '2026-10-08',
    })

    expect(goal.kind).toBe('激励性')
    expect(goal.deadline).toBe('2026-10-11')
    // 引号约定：读回来必须是字符串，不能是 YAML 的 Date 对象
    expect(typeof readFrontmatter(vault, goal.relativePath)['deadline']).toBe('string')
  })

  it('激励性目标缺期限被拒绝；非法日期也被拒绝', () => {
    const vault = track(createEmptyVault())

    expect(vaultErrorCode(() => createGoal({ root: vault, title: 'x', kind: '激励性' }))).toBe(
      'INVALID_INPUT',
    )

    expect(
      vaultErrorCode(() =>
        createGoal({ root: vault, title: 'x', kind: '激励性', deadline: '2026/10/11' }),
      ),
    ).toBe('INVALID_INPUT')

    expect(
      vaultErrorCode(() =>
        createGoal({ root: vault, title: 'x', kind: '激励性', deadline: '2026-02-30' }),
      ),
    ).toBe('INVALID_INPUT')

    expect(listGoals(vault)).toHaveLength(0)
  })

  it('daysLeft 算得出来：未来为正、当天为 0、过去为负', () => {
    const vault = track(createEmptyVault())
    createGoal({ root: vault, title: '三天目标', kind: '激励性', deadline: '2026-10-11' })
    createGoal({ root: vault, title: '今天到期', kind: '激励性', deadline: '2026-10-08' })
    createGoal({ root: vault, title: '已经逾期', kind: '激励性', deadline: '2026-10-05' })

    const goals = listGoals(vault, { today: '2026-10-08' })
    const byTitle = new Map(goals.map((goal) => [goal.title, goal]))

    expect(byTitle.get('三天目标')?.daysLeft).toBe(3)
    expect(byTitle.get('今天到期')?.daysLeft).toBe(0)
    expect(byTitle.get('已经逾期')?.daysLeft).toBe(-3)
  })

  it('常规目标不要求期限；缺省就是常规', () => {
    const vault = track(createEmptyVault())
    const defaulted = createGoal({ root: vault, title: '不写类型' })
    const regular = createGoal({ root: vault, title: '常规目标', kind: '常规' })

    expect(defaulted.kind).toBe('常规')
    expect(defaulted.deadline).toBeUndefined()
    expect(defaulted.daysLeft).toBeUndefined()
    expect(regular.deadline).toBeUndefined()
  })

  it('kind 取值域之外被拒绝', () => {
    const vault = track(createEmptyVault())
    expect(vaultErrorCode(() => createGoal({ root: vault, title: 'x', kind: '梦想' }))).toBe(
      'INVALID_INPUT',
    )
  })

  it('旧文件（没有 kind / deadline 键）读回取默认值，不报错', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '旧目标' })

    // 模拟旧文件：把 kind 键删掉
    const absolute = join(vault, goal.relativePath)
    const raw = readFileSync(absolute, 'utf8').replace(/^kind: .*\n/m, '')
    writeFileSync(absolute, raw, 'utf8')

    const read = requireGoal(vault, goal.id)
    expect(read.kind).toBe('常规')
    expect(read.deadline).toBeUndefined()
  })
})
