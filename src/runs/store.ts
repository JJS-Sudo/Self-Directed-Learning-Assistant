import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPrices } from '../map-gen/estimate.js'
import type { ChatUsage } from '../llm/client.js'

export const RUNS_FILE = '.sdl-runs.json'
const MAX_RUNS = 1000

export interface LlmRun {
  at: string
  goalId?: string
  kind: string
  ok: boolean
  promptTokens?: number
  completionTokens?: number
  costCny?: number
  durationMs?: number
  error?: string
}

export function runsFilePath(root: string): string {
  return join(root, RUNS_FILE)
}

export function readRuns(root: string): LlmRun[] {
  const path = runsFilePath(root)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return Array.isArray(parsed) ? (parsed as LlmRun[]) : []
  } catch {
    // 损坏就备份并当作空历史，不阻塞质量面板
    try {
      renameSync(path, `${path}.bak`)
    } catch {
      // 备份失败也不影响读取
    }
    return []
  }
}

export function appendRun(root: string, run: LlmRun): void {
  const runs = readRuns(root)
  runs.push(run)
  writeFileSync(runsFilePath(root), JSON.stringify(runs.slice(-MAX_RUNS), null, 2), 'utf8')
}

/** 真实 usage × 价格表；两边都没有 token 时返回 undefined（不编数字） */
export function costOf(
  usage: ChatUsage | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  if (usage === undefined) return undefined
  if (usage.promptTokens === undefined && usage.completionTokens === undefined) return undefined
  const prices = readPrices(env)
  const input = usage.promptTokens ?? 0
  const output = usage.completionTokens ?? 0
  const cost =
    (input / 1_000_000) * prices.inputPerMillionCny +
    (output / 1_000_000) * prices.outputPerMillionCny
  return Math.round(cost * 1_000_000) / 1_000_000
}
