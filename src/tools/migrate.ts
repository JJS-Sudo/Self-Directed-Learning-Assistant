import { planMigration, runMigration } from '../migrate/legacy.js'
import { VaultError, messageOf } from '../vault/errors.js'
import { resolveVaultPath } from '../vault/paths.js'
import { isDirectRun, type ToolOptions } from './direct-run.js'

/**
 * `npm run migrate [-- --dry-run]`
 * 把旧的平铺目录一次性搬进目标分区。`--dry-run` 只打印计划，不碰任何文件。
 * 返回退出码，便于测试直接调用。
 */
export function runMigrate(options: ToolOptions = {}): number {
  try {
    const root = resolveVaultPath({
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    })
    const argv = options.argv ?? process.argv.slice(2)
    const dryRun = argv.includes('--dry-run')

    console.log(`[sdl migrate] 库：${root}`)
    console.log(`[sdl migrate] 模式：${dryRun ? '试跑（不改任何文件）' : '正式迁移'}`)

    const plan = planMigration(root)
    console.log(
      `[sdl migrate] 计划：搬 ${plan.moves.length} 个文件，` +
        `${plan.unattributable.length} 个归属不明（留在原处），` +
        `${plan.goals.filter((goal) => goal.needsKind).length} 个目标要补 kind。`,
    )

    for (const goal of plan.goals) {
      if (goal.needsKind) {
        console.log(`[sdl migrate]   + kind: 常规  →  ${goal.id} ${goal.title}`)
      }
    }

    const byTarget = new Map<string, number>()
    for (const move of plan.moves) {
      const dir = move.to.split(/[\\/]/).slice(0, 2).join('/')
      byTarget.set(dir, (byTarget.get(dir) ?? 0) + 1)
    }
    for (const [dir, count] of [...byTarget.entries()].sort()) {
      console.log(`[sdl migrate]   ${count} 个文件  →  ${dir}`)
    }
    for (const item of plan.unattributable) {
      console.log(`[sdl migrate]   ! 留在原处：${item.relativePath}（${item.reason}）`)
    }

    const result = runMigration(root, { dryRun })
    console.log(
      `[sdl migrate] ${dryRun ? '试跑完成' : '迁移完成'}：` +
        `搬了 ${result.moved} 个，文件数 ${result.filesBefore} → ${result.filesAfter}`,
    )
    if (result.filesBefore !== result.filesAfter) {
      throw new Error('文件数不守恒 —— 迁移不该丢文件，请检查上面的计划')
    }
    return 0
  } catch (error) {
    console.error(`[sdl migrate] 失败：${messageOf(error)}`)
    if (error instanceof VaultError) console.error(`[sdl migrate] 错误码：${error.code}`)
    return 1
  }
}

if (isDirectRun(import.meta.url)) process.exitCode = runMigrate()
