import { indexFilePath } from '../index-db/db.js'
import { forceRebuild } from '../index-db/with-index.js'
import { messageOf } from '../vault/errors.js'
import { resolveVaultPath } from '../vault/paths.js'
import { isDirectRun, type ToolOptions } from './direct-run.js'

/**
 * `npm run index`
 * 强制全量重建 SQLite 索引。索引是派生物：删掉它不会丢数据，重跑即可。
 * 返回退出码（0 成功 / 1 失败），便于测试直接调用。
 */
export function runIndex(options: ToolOptions = {}): number {
  try {
    const root = resolveVaultPath({
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    })
    console.log(`[sdl index] 库：${root}`)
    const count = forceRebuild(root)
    console.log(`[sdl index] 重建 ${count} 个目标 · 索引：${indexFilePath(root)}`)
    return 0
  } catch (error) {
    console.error(`[sdl index] 重建失败：${messageOf(error)}`)
    return 1
  }
}

if (isDirectRun(import.meta.url)) process.exitCode = runIndex()
