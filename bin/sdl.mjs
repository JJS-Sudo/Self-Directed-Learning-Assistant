#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const distArgs = join(root, 'dist', 'cli', 'args.js')
const distEntry = join(root, 'dist', 'index.js')

if (!existsSync(distEntry) || !existsSync(distArgs)) {
  console.error('[sdl] 还没构建：先运行 npm run build，再试 `npx sdl start`。')
  process.exit(1)
}

const { parseArgs, USAGE } = await import(pathToFileURL(distArgs).href)
const parsed = parseArgs(process.argv.slice(2))

if (parsed.error !== undefined) {
  console.error(parsed.error)
  process.exit(1)
}
if (parsed.command === 'help') {
  console.log(USAGE)
  process.exit(0)
}
if (parsed.command === 'version') {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  console.log(pkg.version)
  process.exit(0)
}

process.env.HOST ??= '127.0.0.1'
await import(pathToFileURL(distEntry).href)
