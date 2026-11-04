import { join } from 'node:path'
import { VaultError, messageOf } from '../vault/errors.js'
import { resolveVaultPath } from '../vault/paths.js'
import { resetVault } from '../vault/reset.js'
import { isDirectRun, type ToolOptions } from './direct-run.js'

/** `npm run reset`：按 seeds 白名单重建库，保留用户笔记。返回退出码。 */
export function runReset(options: ToolOptions = {}): number {
  try {
    const root = resolveVaultPath({
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    })
    const seedsDir = join(options.cwd ?? process.cwd(), 'seeds')

    console.log(`[sdl reset] 库：${root}`)
    console.log(`[sdl reset] 种子：${seedsDir}`)

    const result = resetVault({ root, seedsDir })

    console.log(`[sdl reset] 由 seeds 定义的文件共 ${result.seedFiles.length} 个`)
    console.log(`[sdl reset] 删除 ${result.deleted.length} 个、恢复 ${result.restored.length} 个`)
    console.log('[sdl reset] 非受管文件（.obsidian/、用户笔记等）未改动。')
    return 0
  } catch (error) {
    console.error(`[sdl reset] 失败：${messageOf(error)}`)
    if (error instanceof VaultError) console.error(`[sdl reset] 错误码：${error.code}`)
    return 1
  }
}

if (isDirectRun(import.meta.url)) process.exitCode = runReset()
