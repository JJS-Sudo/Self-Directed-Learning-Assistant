import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findWebRoot } from '../src/server/web-root.js'
import { makeTempDir, removeDir } from './helpers.js'

const dirs: string[] = []

function track(dir: string): string {
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('生产模式的前端目录探测', () => {
  it('没有 web/index.html 时返回 undefined（dev 形态）', () => {
    expect(findWebRoot(track(makeTempDir('sdl-noweb-')))).toBeUndefined()
  })

  it('有 web/index.html 时返回该目录', () => {
    const base = track(makeTempDir('sdl-webroot-'))
    mkdirSync(join(base, 'web'))
    writeFileSync(join(base, 'web', 'index.html'), '<!doctype html>', 'utf8')

    expect(findWebRoot(base)).toBe(join(base, 'web'))
  })

  it('空 web 目录（没有 index.html）不算构建产物', () => {
    const base = track(makeTempDir('sdl-emptyweb-'))
    mkdirSync(join(base, 'web'))

    expect(findWebRoot(base)).toBeUndefined()
  })
})
