import { join } from 'node:path'
import { requireGoal } from '../domain/goals.js'
import { generateAllMaps, generateGoalMaps } from '../maps/index.js'
import { checkDanglingResources } from '../maps/knowledge-map.js'
import { VaultError, messageOf } from '../vault/errors.js'
import { resolveVaultPath } from '../vault/paths.js'
import { isDirectRun, type ToolOptions } from './direct-run.js'

/**
 * `npm run maps [-- --goal <目标id>]`
 * 重新生成 Obsidian 侧的六个派生物（知识地图 / 学习路径 / 复盘 的 md 与 canvas）。
 * 返回退出码，便于测试直接调用。
 */

function readGoalFlag(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--goal')
  if (index === -1) return undefined
  const value = argv[index + 1]
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}

export function runMaps(options: ToolOptions = {}): number {
  try {
    const root = resolveVaultPath({
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    })
    const goalId = readGoalFlag(options.argv ?? process.argv.slice(2))

    console.log(`[sdl maps] 库：${root}`)

    const reports =
      goalId === undefined
        ? generateAllMaps(root)
        : [generateGoalMaps(root, requireGoal(root, goalId))]

    if (reports.length === 0) {
      console.log('[sdl maps] 库里还没有目标，什么都没生成。')
      return 0
    }

    for (const report of reports) {
      console.log(
        `[sdl maps] ${report.goalTitle}  →  ${report.areaRelativePath}` +
          `（节点 ${report.nodes} / 段 ${report.stages} / 复盘 ${report.retrospectives}）`,
      )
      for (const artifact of report.artifacts) {
        console.log(`[sdl maps]   · ${join(artifact)}`)
      }
      if (report.skipped.length > 0) {
        console.log(
          `[sdl maps]   跳过了 ${report.skipped.length} 个非法文件（没有 id/type，不参与生成）：`,
        )
        for (const file of report.skipped) console.log(`[sdl maps]     - ${file}`)
      }
      if (report.uncoveredLeaves.length > 0) {
        console.log(
          `[sdl maps]   ! ${report.uncoveredLeaves.length} 个叶子节点没有被任何路径段覆盖（拆了却没排进路径）：`,
        )
        for (const item of report.uncoveredLeaves) console.log(`[sdl maps]     - ${item}`)
      }
      if (report.missingNodes.length > 0) {
        console.log('[sdl maps]   ! 有路径段引用了地图上已不存在的节点：')
        for (const item of report.missingNodes) console.log(`[sdl maps]     - ${item}`)
      }
      if (report.unusedResources.length > 0) {
        console.log(
          `[sdl maps]   ! ${report.unusedResources.length} 条资源没有任何路径段用到（凑了资源却没排进路径）：`,
        )
        for (const item of report.unusedResources) console.log(`[sdl maps]     - ${item}`)
      }
    }

    // 跨库检查：资源挂在不存在的节点上（这类资源推不出归属目标，只能报一次）
    const dangling = checkDanglingResources(root)
    if (dangling.length > 0) {
      console.log(`[sdl maps]   ! ${dangling.length} 条资源的 node 指向不存在的节点（断链）：`)
      for (const item of dangling) {
        console.log(`[sdl maps]     - ${item.id} ${item.title} → node=${item.nodeId}`)
      }
    }

    console.log(`[sdl maps] 完成：${reports.length} 个目标，共 ${reports.length * 6} 个派生物。`)
    return 0
  } catch (error) {
    console.error(`[sdl maps] 失败：${messageOf(error)}`)
    if (error instanceof VaultError) console.error(`[sdl maps] 错误码：${error.code}`)
    return 1
  }
}

if (isDirectRun(import.meta.url)) process.exitCode = runMaps()
