import type { GoalSummary } from '../domain/goals.js'
import { listNodes } from '../domain/nodes.js'
import { coverageWarnings } from '../map-gen/persist.js'
import { readRuns, type LlmRun } from '../runs/store.js'

export type WarningCategory = '地图' | '路径' | '资源' | '生成'

export interface QualityWarning {
  category: WarningCategory
  message: string
}

export interface QualityReport {
  warnings: QualityWarning[]
  failures: LlmRun[]
  runs: LlmRun[]
  budget: { budgetCny?: number; spentCny: number; over: boolean }
}

export function categorize(message: string): WarningCategory {
  if (message.includes('资源')) return '资源'
  if (message.includes('路径段引用') || message.includes('不存在的节点')) return '路径'
  return '地图'
}

/** 四类警告 + 失败原因 + 费用/预算；stages/resources 的警告来自同一次覆盖检查 */
export function buildQualityReport(root: string, goal: GoalSummary): QualityReport {
  const messages = coverageWarnings(root, goal, listNodes(root, goal.id))
  const warnings: QualityWarning[] = messages.map((message) => ({
    category: categorize(message),
    message,
  }))

  const runs = readRuns(root).filter((run) => run.goalId === goal.id)
  const spentCny = runs.reduce((sum, run) => sum + (run.costCny ?? 0), 0)
  const budgetCny = goal.budgetCny

  return {
    warnings,
    failures: runs
      .filter((run) => !run.ok)
      .slice(-20)
      .reverse(),
    runs: runs.slice(-50).reverse(),
    budget: {
      ...(budgetCny === undefined ? {} : { budgetCny }),
      spentCny: Math.round(spentCny * 1_000_000) / 1_000_000,
      over: budgetCny !== undefined && spentCny > budgetCny,
    },
  }
}
