import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { areaSubdirRelativePath } from '../vault/goal-areas.js'
import type { GoalSummary } from './goals.js'

export interface LayoutPosition {
  id: string
  x: number
  y: number
}

export interface MapLayout {
  positions: LayoutPosition[]
}

export function layoutRelativePath(goal: GoalSummary): string {
  return `${areaSubdirRelativePath(goal, '知识网')}/布局.json`
}

export function readLayout(root: string, goal: GoalSummary): MapLayout | null {
  const path = join(root, layoutRelativePath(goal))
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { positions?: unknown }
    const raw = Array.isArray(parsed.positions) ? parsed.positions : []
    const positions: LayoutPosition[] = []
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>
      const id = typeof record['id'] === 'string' ? record['id'] : ''
      const x = Number(record['x'])
      const y = Number(record['y'])
      if (id === '' || !Number.isFinite(x) || !Number.isFinite(y)) continue
      positions.push({ id, x, y })
    }
    return { positions }
  } catch {
    return null
  }
}

export function writeLayout(
  root: string,
  goal: GoalSummary,
  positions: readonly LayoutPosition[],
): MapLayout {
  const clamp = (value: number): number => Math.max(-10_000, Math.min(10_000, value))
  const clean = positions
    .filter((item) => item.id !== '' && Number.isFinite(item.x) && Number.isFinite(item.y))
    .map((item) => ({ id: item.id, x: clamp(item.x), y: clamp(item.y) }))

  const path = join(root, layoutRelativePath(goal))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ positions: clean }, null, 2), 'utf8')
  return { positions: clean }
}
