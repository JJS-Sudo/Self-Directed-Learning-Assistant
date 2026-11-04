import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('公开快照', () => {
  it('生成单提交、指向 ./vault、且不含私人数据', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sdl-snapshot-')), 'snapshot')
    dirs.push(out)

    execFileSync('node', ['scripts/public-snapshot.mjs', '--out', out], {
      cwd: process.cwd(),
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: 'pipe',
    })

    const commits = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: out,
      encoding: 'utf8',
    }).trim()
    expect(commits).toBe('1')

    const sdlrc = JSON.parse(readFileSync(join(out, '.sdlrc.json'), 'utf8')) as {
      vaultPath: string
    }
    expect(sdlrc.vaultPath).toBe('./vault')

    expect(existsSync(join(out, 'node_modules'))).toBe(false)
    expect(existsSync(join(out, 'dist'))).toBe(false)
    expect(existsSync(join(out, 'vault'))).toBe(false)
    expect(existsSync(join(out, '自我导向学习项目运行库'))).toBe(false)
    expect(existsSync(join(out, '.sdl-secrets.json'))).toBe(false)
    expect(existsSync(join(out, 'src', 'app.ts'))).toBe(true)
    expect(existsSync(join(out, 'src', 'vault', 'paths.ts'))).toBe(true)
  })
})
