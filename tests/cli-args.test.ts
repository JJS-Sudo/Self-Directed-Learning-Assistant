import { describe, expect, it } from 'vitest'
import { parseArgs, USAGE } from '../src/cli/args.js'

describe('sdl 子命令解析', () => {
  it('没有参数：默认 start', () => {
    expect(parseArgs([])).toEqual({ command: 'start' })
  })

  it('显式 start', () => {
    expect(parseArgs(['start'])).toEqual({ command: 'start' })
  })

  it('帮助与版本', () => {
    expect(parseArgs(['--help']).command).toBe('help')
    expect(parseArgs(['-h']).command).toBe('help')
    expect(parseArgs(['--version']).command).toBe('version')
  })

  it('未知子命令：带用法错误', () => {
    const parsed = parseArgs(['nope'])

    expect(parsed.command).toBe('help')
    expect(parsed.error).toContain('未知子命令：nope')
    expect(parsed.error).toContain(USAGE)
  })
})
