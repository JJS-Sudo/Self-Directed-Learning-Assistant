#!/usr/bin/env node
/**
 * 生成「可以公开」的干净快照仓库。
 *
 * 用 `git ls-files` 作为清单：只复制已跟踪文件，脏文件与未跟踪数据不会混进来。
 * 私人运行库、依赖、构建产物、密钥、测试产物一律排除；`.sdlrc.json` 改指 `./vault`。
 *
 * 用法：node scripts/public-snapshot.mjs --out ../sdl-public
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const EXCLUDED_ROOT_DIRS = new Set([
  '自我导向学习项目运行库',
  '.dsh',
  'node_modules',
  'dist',
  'tmp',
  'test-results',
  'playwright-report',
  'vault',
  '.git',
])
const EXCLUDED_ANYWHERE = new Set(['node_modules', '.git'])
const EXCLUDED_FILES = new Set(['.env', '.sdl-secrets.json'])
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,
  /tvly-[A-Za-z0-9]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]

function readOutDir() {
  const index = process.argv.indexOf('--out')
  const raw = index === -1 ? '../sdl-public' : process.argv[index + 1]
  if (raw === undefined || raw.trim() === '') throw new Error('缺少 --out 目录')
  return resolve(process.cwd(), raw)
}

function trackedFiles(repo) {
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' })
  return raw.split('\0').filter((line) => line !== '')
}

function isExcluded(relativePath) {
  const segments = relativePath.split('/')
  if (EXCLUDED_FILES.has(segments[segments.length - 1])) return true
  if (segments.some((segment) => EXCLUDED_ANYWHERE.has(segment))) return true
  // 只排除根目录下的 vault/，不能误伤 src/vault/
  return EXCLUDED_ROOT_DIRS.has(segments[0])
}

function copyTracked(repo, out, files) {
  let copied = 0
  for (const file of files) {
    if (isExcluded(file)) continue
    const source = join(repo, file.split('/').join(sep))
    if (!existsSync(source) || !statSync(source).isFile()) continue
    const target = join(out, file.split('/').join(sep))
    cpSync(source, target)
    copied += 1
  }
  return copied
}

function scanForLeaks(out) {
  const problems = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name)
      const rel = relative(out, absolute).split(sep).join('/')
      if (entry.name === '.git') continue
      if (entry.name === '自我导向学习项目运行库') {
        problems.push(`仍包含私人库目录：${rel}`)
        continue
      }
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }
      if (!/\.(md|json|ts|tsx|js|mjs|css|yml|yaml|txt|html|sh)$/i.test(entry.name)) continue
      const content = readFileSync(absolute, 'utf8')
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) problems.push(`${rel} 疑似包含密钥`)
      }
    }
  }
  walk(out)
  return problems
}

function gitInit(out) {
  execFileSync('git', ['init', '-q'], { cwd: out })
  execFileSync('git', ['add', '-A'], { cwd: out })
  execFileSync(
    'git',
    [
      '-c',
      'user.name=public-snapshot',
      '-c',
      'user.email=snapshot@localhost',
      'commit',
      '-q',
      '-m',
      'chore: public snapshot',
    ],
    { cwd: out },
  )
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: out,
    encoding: 'utf8',
  }).trim()
}

function main() {
  const repo = process.cwd()
  const out = readOutDir()

  if (existsSync(out) && readdirSync(out).length > 0) {
    console.error(`目标目录已存在且非空，拒绝覆盖：${out}`)
    process.exit(1)
  }

  const files = trackedFiles(repo)
  const copied = copyTracked(repo, out, files)
  writeFileSync(join(out, '.sdlrc.json'), `${JSON.stringify({ vaultPath: './vault' }, null, 2)}\n`)

  const leaks = scanForLeaks(out)
  if (leaks.length > 0) {
    console.error('自检失败：快照里可能有私人数据或密钥')
    for (const problem of leaks) console.error(` - ${problem}`)
    process.exit(1)
  }

  const commit = gitInit(out)
  console.log(`快照已生成：${out}`)
  console.log(`文件 ${copied} 个 · 初始提交 ${commit}`)
  console.log('下一步：在 GitHub / Gitee 各建一个空仓库，然后分别 push。')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
