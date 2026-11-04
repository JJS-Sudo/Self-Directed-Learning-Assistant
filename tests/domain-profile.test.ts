import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROFILE_PATH,
  readProfile,
  readProfileOrDefault,
  writeProfile,
} from '../src/domain/profile.js'
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

function frontmatterOf(vault: string): Record<string, unknown> {
  return parseDocument(readFileSync(join(vault, PROFILE_PATH), 'utf8')).data
}

describe('TG1 · 学习者画像的读写', () => {
  it('写入后三项字段落盘在 00-配置/profile.md，并能逐项读回', () => {
    const vault = track(createEmptyVault())
    const written = writeProfile(vault, {
      level: '进阶',
      mediaPreference: '文字',
      timeBudget: 8,
    })

    const data = frontmatterOf(vault)
    expect(data['level']).toBe('进阶')
    expect(data['media_preference']).toBe('文字')
    expect(data['time_budget']).toBe(8)

    expect(written.level).toBe('进阶')
    expect(written.mediaPreference).toBe('文字')
    expect(written.timeBudget).toBe(8)

    const read = readProfile(vault)
    expect(read).toEqual(written)
  })

  it('局部更新：只改画中一项，其余保持不变', () => {
    const vault = track(createEmptyVault())
    writeProfile(vault, { level: '进阶', mediaPreference: '文字', timeBudget: 8 })
    writeProfile(vault, { timeBudget: 3 })

    const read = readProfile(vault)
    expect(read.level).toBe('进阶')
    expect(read.mediaPreference).toBe('文字')
    expect(read.timeBudget).toBe(3)
  })

  it('单例：写两次不产生第二条记录，id 不变', () => {
    const vault = track(createEmptyVault())
    const first = readProfile(vault)
    writeProfile(vault, { level: '熟练' })
    writeProfile(vault, { mediaPreference: '视频' })

    const second = readProfile(vault)
    expect(second.id).toBe(first.id)
    expect(second.relativePath).toBe(PROFILE_PATH)
  })

  it('取值域外的 level / media_preference 被拒绝', () => {
    const vault = track(createEmptyVault())
    expect(vaultErrorCode(() => writeProfile(vault, { level: '大师' }))).toBe('INVALID_INPUT')
    expect(vaultErrorCode(() => writeProfile(vault, { mediaPreference: '播客' }))).toBe(
      'INVALID_INPUT',
    )
  })

  it('time_budget 必须是正整数', () => {
    const vault = track(createEmptyVault())
    expect(vaultErrorCode(() => writeProfile(vault, { timeBudget: 0 }))).toBe('INVALID_INPUT')
    expect(vaultErrorCode(() => writeProfile(vault, { timeBudget: -3 }))).toBe('INVALID_INPUT')
  })

  it('画像文件缺失时，宽容读取回落默认值而不是抛错', () => {
    const vault = track(createEmptyVault())
    removeDir(join(vault, PROFILE_PATH))
    removeDir(join(vault, '00-配置'))

    expect(vaultErrorCode(() => readProfile(vault))).toBe('NOT_FOUND')
    expect(readProfileOrDefault(vault)).toMatchObject({
      level: '入门',
      mediaPreference: '不限',
      timeBudget: 5,
    })
  })
})
