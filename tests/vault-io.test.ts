import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { REQUIRED_FIELDS } from '../src/vault/document.js'
import { readDocument, writeDocument } from '../src/vault/io.js'
import {
  copySeedsInto,
  createTempVault,
  createUnmarkedVault,
  makeTempDir,
  removeDir,
  vaultErrorCode,
} from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

function fileNameOf(relativePath: string): string {
  return relativePath.split(/[\\/]/).pop() ?? ''
}

describe('库写入与 frontmatter 往返', () => {
  it('写入 → 读回：四个必备字段齐全，日期是字符串', () => {
    const vault = track(createTempVault())

    const written = writeDocument({
      root: vault,
      dir: '30-路径',
      type: 'path-event',
      title: '精读《类型基础》',
      frontmatter: { date: '2026-09-29', duration_min: 60, order: 1, status: '在用' },
      body: '这一节读类型基础。',
    })

    const read = readDocument(vault, written.relativePath)

    for (const field of REQUIRED_FIELDS) {
      expect(read.data[field], field).toBeDefined()
    }
    expect(read.data['schema_version']).toBe(1)
    expect(typeof read.data['date']).toBe('string')
    expect(read.data['date']).toBe('2026-09-29')
    expect(typeof read.data['created_at']).toBe('string')
    expect(read.data['order']).toBe(1)
  })

  it('文件名是 `{id} {title}.md`', () => {
    const vault = track(createTempVault())
    const written = writeDocument({
      root: vault,
      dir: '30-路径',
      type: 'path-event',
      title: '练习泛型约束',
      body: 'x',
    })

    expect(fileNameOf(written.relativePath)).toBe(`${String(written.data['id'])} 练习泛型约束.md`)
  })

  it('标题里的 Windows 非法字符被转义', () => {
    const vault = track(createTempVault())
    const written = writeDocument({
      root: vault,
      dir: '10-目标',
      type: 'goal',
      title: 'A/B:C*D?E',
      body: 'x',
    })
    const fileName = fileNameOf(written.relativePath)

    expect(fileName.endsWith('A_B_C_D_E.md')).toBe(true)
    expect(written.absolutePath).not.toContain('?')
  })

  it('id 在库内唯一', () => {
    const vault = track(createTempVault())
    const first = writeDocument({
      root: vault,
      dir: '10-目标',
      type: 'goal',
      title: '同名',
      body: 'x',
    })
    const second = writeDocument({
      root: vault,
      dir: '10-目标',
      type: 'goal',
      title: '同名',
      body: 'y',
    })

    expect(first.data['id']).not.toBe(second.data['id'])
    expect(existsSync(first.absolutePath)).toBe(true)
    expect(existsSync(second.absolutePath)).toBe(true)
  })

  it('受管区块外的用户手写内容在重写时被保留', () => {
    const vault = track(createTempVault())
    const first = writeDocument({
      root: vault,
      dir: '30-路径',
      type: 'path-event',
      title: '会被重写的文件',
      body: 'v1',
    })

    writeFileSync(
      first.absolutePath,
      `${readFileSync(first.absolutePath, 'utf8')}\n用户自己写的一段话\n`,
      'utf8',
    )

    writeDocument({
      root: vault,
      dir: '30-路径',
      type: 'path-event',
      title: '会被重写的文件',
      id: String(first.data['id']),
      body: 'v2',
    })

    const updated = readFileSync(first.absolutePath, 'utf8')
    expect(updated).toContain('用户自己写的一段话')
    expect(updated).toContain('v2')
    expect(updated).not.toContain('v1')
  })

  it('系统所有的四个键不允许被 frontmatter 覆盖', () => {
    const vault = track(createTempVault())
    const written = writeDocument({
      root: vault,
      dir: '10-目标',
      type: 'goal',
      title: '越权尝试',
      frontmatter: { id: 'HACKED', type: 'HACKED', schema_version: 99, created_at: 'HACKED' },
      body: 'x',
    })

    expect(written.data['id']).not.toBe('HACKED')
    expect(written.data['type']).toBe('goal')
    expect(written.data['schema_version']).toBe(1)
    expect(written.data['created_at']).not.toBe('HACKED')
  })
})

describe('写入被拒绝的情形', () => {
  it('缺 .sdl-vault 标记的目录拒绝写入', () => {
    const unmarked = track(createUnmarkedVault())

    expect(
      vaultErrorCode(() =>
        writeDocument({ root: unmarked, dir: '10-目标', type: 'goal', title: 'x', body: 'y' }),
      ),
    ).toBe('MARKER_MISSING')
    expect(existsSync(join(unmarked, '10-目标'))).toBe(false)
  })

  it('越界路径被拒绝，且库外没有文件被创建', () => {
    const parent = track(makeTempDir('sdl-escape-'))
    const vault = join(parent, 'vault')
    copySeedsInto(vault)

    expect(
      vaultErrorCode(() =>
        writeDocument({
          root: vault,
          type: 'goal',
          title: '越界',
          path: '../outside.md',
          body: 'x',
        }),
      ),
    ).toBe('PATH_OUTSIDE_VAULT')
    expect(existsSync(join(parent, 'outside.md'))).toBe(false)
  })

  it('type / dir / title 缺失时报可读错误', () => {
    const vault = track(createTempVault())

    expect(
      vaultErrorCode(() => writeDocument({ root: vault, type: '', dir: '10-目标', title: 'x' })),
    ).toBe('INVALID_INPUT')
    expect(vaultErrorCode(() => writeDocument({ root: vault, type: 'goal', title: 'x' }))).toBe(
      'INVALID_INPUT',
    )
    expect(vaultErrorCode(() => writeDocument({ root: vault, type: 'goal', dir: '10-目标' }))).toBe(
      'INVALID_INPUT',
    )
  })
})
