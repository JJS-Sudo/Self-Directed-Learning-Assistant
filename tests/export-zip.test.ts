import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { buildExportZip, listVaultFiles } from '../src/export/zip.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '导出测试' })
  createNode({ root, title: '节点 A', goal: goal.id })
  writeFileSync(join(root, '20-学习项目', 'x.canvas'), '{}', 'utf8')
  writeFileSync(join(root, '.sdl-index.db'), 'junk', 'utf8')
  writeFileSync(join(root, '.sdl-runs.json'), '[]', 'utf8')
  writeFileSync(join(root, '.sdl-secrets.json'), '{}', 'utf8')
  return { root, goalId: goal.id }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('导出文件清单', () => {
  it('默认排除索引、运行记录与 canvas', () => {
    const { root } = setup()
    const files = listVaultFiles(root)

    expect(files.some((file) => file.startsWith('10-目标/'))).toBe(true)
    expect(files.some((file) => file.endsWith('.canvas'))).toBe(false)
    expect(files.some((file) => file.includes('.sdl-index.db'))).toBe(false)
    expect(files.some((file) => file.includes('.sdl-runs.json'))).toBe(false)
    expect(files.some((file) => file.includes('.sdl-secrets.json'))).toBe(false)
  })

  it('canvas=1 时带上 canvas', () => {
    const { root } = setup()
    expect(listVaultFiles(root, { includeCanvas: true }).some((f) => f.endsWith('.canvas'))).toBe(
      true,
    )
  })

  it('按目标过滤：别的目标文件不在包里', () => {
    const { root, goalId } = setup()
    const other = createGoal({ root, title: '另一个目标' })
    const files = listVaultFiles(root, { goalId })

    expect(files.some((file) => file.includes(goalId))).toBe(true)
    expect(files.some((file) => file.includes(other.id))).toBe(false)
  })
})

describe('导出 zip', () => {
  it('zip 里能读到 Markdown，且不含派生文件', async () => {
    const { root } = setup()
    const zip = await JSZip.loadAsync(await buildExportZip(root, { includeCanvas: true }))
    const names = Object.keys(zip.files)

    expect(names.some((name) => name.startsWith('10-目标/') && name.endsWith('.md'))).toBe(true)
    expect(names.some((name) => name.endsWith('.canvas'))).toBe(true)
    expect(names.some((name) => name.includes('.sdl-index.db'))).toBe(false)
    expect(names.some((name) => name.includes('.sdl-runs.json'))).toBe(false)
  })
})
