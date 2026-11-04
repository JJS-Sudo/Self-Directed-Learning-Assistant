import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import {
  areaSubdirRelativePath,
  ensureGoalArea,
  findAreaName,
  goalAreaName,
  goalAreaRelativePath,
  listAreaNames,
} from '../src/vault/goal-areas.js'
import { writeDocument } from '../src/vault/io.js'
import { createEmptyVault, removeDir, vaultErrorCode } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

describe('TG1 · 每目标一个分区', () => {
  it('建区后四个子目录齐全，且幂等', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '三天完成人生第一个软件设计' })

    const first = ensureGoalArea(vault, goal)
    expect(first.relativePath).toBe(goalAreaRelativePath(goal))
    for (const subdir of ['知识网', '学习路径', '验收', '复盘'] as const) {
      expect(existsSync(join(vault, areaSubdirRelativePath(goal, subdir))), subdir).toBe(true)
    }

    const second = ensureGoalArea(vault, goal)
    expect(second.created).toEqual([])
  })

  it('目标与资源不搬进分区；分区名以目标 id 开头', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '精通 TypeScript 类型系统' })
    ensureGoalArea(vault, goal)

    expect(goalAreaName(goal).startsWith(`${goal.id} `)).toBe(true)
    expect(listAreaNames(vault)).toEqual([goalAreaName(goal)])
    expect(findAreaName(vault, goal.id)).toBe(goalAreaName(goal))
    expect(listAreaNames(vault).some((name) => name.includes('40-资源'))).toBe(false)
  })

  it('目标标题改了、分区目录还是旧名时报错，不静默留孤儿', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '旧标题' })
    ensureGoalArea(vault, goal)

    const renamed = { ...goal, title: '新标题' }
    expect(vaultErrorCode(() => ensureGoalArea(vault, renamed))).toBe('INVALID_INPUT')
  })

  it('分区写入仍受越界校验保护', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '目标' })
    ensureGoalArea(vault, goal)

    expect(
      vaultErrorCode(() =>
        writeDocument({
          root: vault,
          type: 'map-node',
          title: '越界',
          path: join('..', '..', 'outside.md'),
        }),
      ),
    ).toBe('PATH_OUTSIDE_VAULT')
  })
})
