import { writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { readKeys, effectiveEnv, maskKey, writeKeys } from '../src/settings/keys.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(): string {
  const root = createEmptyVault()
  dirs.push(root)
  return root
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('页面保存的 key', () => {
  it('写入、读取、清除', () => {
    const root = setup()

    writeKeys(root, { deepseek: 'sk-1234' })
    expect(readKeys(root)).toEqual({ deepseek: 'sk-1234' })

    writeKeys(root, { deepseek: null })
    expect(readKeys(root)).toEqual({})
  })

  it('掩码只露尾部 4 位', () => {
    expect(maskKey('sk-abcdef1234')).toBe('••••1234')
    expect(maskKey('abc')).toBe('••••')
    expect(maskKey(undefined)).toBeUndefined()
  })

  it('文件损坏时当作没有 key', () => {
    const root = setup()
    writeKeys(root, { deepseek: 'sk-1' })
    const path = `${root}/.sdl-secrets.json`
    writeFileSync(path, 'not json', 'utf8')

    expect(readKeys(root)).toEqual({})
  })
})

describe('运行时环境', () => {
  it('环境变量优先于页面保存', () => {
    const root = setup()
    writeKeys(root, { deepseek: 'sk-page' })

    expect(effectiveEnv(root, {}).DEEPSEEK_API_KEY).toBe('sk-page')
    expect(effectiveEnv(root, { DEEPSEEK_API_KEY: 'sk-env' }).DEEPSEEK_API_KEY).toBe('sk-env')
  })

  it('空字符串环境变量视为未设置', () => {
    const root = setup()
    writeKeys(root, { tavily: 'tvly-page' })

    expect(effectiveEnv(root, { TAVILY_API_KEY: '   ' }).TAVILY_API_KEY).toBe('tvly-page')
  })
})
