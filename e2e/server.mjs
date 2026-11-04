import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const vault = join(tmpdir(), `sdl-e2e-${process.pid}`)
mkdirSync(vault, { recursive: true })

function copyDir(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const source = join(from, entry)
    const target = join(to, entry)
    if (statSync(source).isDirectory()) copyDir(source, target)
    else copyFileSync(source, target)
  }
}

copyDir(join(root, 'seeds'), vault)
writeFileSync(join(vault, '.sdl-vault'), '{"marker":"sdl-vault","schema_version":1}', 'utf8')

process.env['SDL_VAULT_PATH'] = vault
process.env['HOST'] = '127.0.0.1'
process.env['PORT'] = '3111'
delete process.env['SDL_ACCESS_TOKEN']

await import(pathToFileURL(join(root, 'dist', 'index.js')).href)
