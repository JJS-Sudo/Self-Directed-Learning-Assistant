import JSZip from 'jszip'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal, listGoals } from '../src/domain/goals.js'
import { buildExportZip } from '../src/export/zip.js'
import { importZip } from '../src/import/zip.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('导入 zip', () => {
  it('导出再导入：目标能在新库里读回', async () => {
    const source = createEmptyVault()
    dirs.push(source)
    createGoal({ root: source, title: '被导入的目标' })

    const target = createEmptyVault()
    dirs.push(target)

    const zip = await buildExportZip(source)
    const result = await importZip(target, zip)

    expect(result.imported.length).toBeGreaterThan(0)
    expect(result.failed).toEqual([])
    expect(listGoals(target).map((goal) => goal.title)).toEqual(['被导入的目标'])
  })

  it('第二次导入：全部 skipped（已存在）', async () => {
    const source = createEmptyVault()
    dirs.push(source)
    createGoal({ root: source, title: '目标' })
    const target = createEmptyVault()
    dirs.push(target)

    const zip = await buildExportZip(source)
    await importZip(target, zip)
    const again = await importZip(target, zip)

    expect(again.imported).toEqual([])
    expect(again.skipped.every((entry) => entry.reason === '已存在')).toBe(true)
  })

  it('zip slip：JSZip 会把 ../ 规范化掉，导入后仍在库根内', async () => {
    const target = createEmptyVault()
    dirs.push(target)
    const zip = new JSZip()
    zip.file('../evil.md', 'x')

    const result = await importZip(target, await zip.generateAsync({ type: 'nodebuffer' }))

    expect(result.imported.every((path) => !path.includes('..'))).toBe(true)
    expect(existsSync(join(target, 'evil.md'))).toBe(true)
    expect(existsSync(join(target, '..', 'evil.md'))).toBe(false)
  })

  it('带盘符的绝对路径：直接拒绝', async () => {
    const target = createEmptyVault()
    dirs.push(target)
    const zip = new JSZip()
    zip.file('C:/evil.md', 'x')

    await expect(
      importZip(target, await zip.generateAsync({ type: 'nodebuffer' })),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
  })

  it('派生文件被忽略而不是导入', async () => {
    const target = createEmptyVault()
    dirs.push(target)
    const zip = new JSZip()
    zip.file('.sdl-runs.json', '[]')
    zip.file('10-目标/ok.md', 'hello')
    const result = await importZip(target, await zip.generateAsync({ type: 'nodebuffer' }))

    expect(result.imported).toEqual(['10-目标/ok.md'])
    expect(result.skipped[0]?.reason).toBe('派生文件，已忽略')
  })
})
