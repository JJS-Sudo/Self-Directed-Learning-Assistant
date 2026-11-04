import type { Profile } from './profile.js'

/**
 * 资源推荐排序 —— **纯函数**，无 I/O、无时间依赖，因此「同一输入两次调用结果完全相同」是结构性保证。
 *
 * 三因子加权（SOP.md 第 2 节 已落定的决策）：
 *   - `level` 匹配画像 `level` → **+3**
 *   - `media` 命中画像 `media_preference` → **+2**（画像为「不限」时两类都命中，等权）
 *   - `duration_min` 不超过画像 `time_budget`（小时 → 分钟）→ **+1**；缺该字段时记 0 并写「时长未知」
 *
 * 并列兜底：`created_at` 升序 → `id` 升序，保证可重现，不依赖文件系统返回顺序。
 */

export const WEIGHTS = { level: 3, media: 2, duration: 1 } as const

/** 参与排序所需要的最小字段集：ResourceSummary 天然满足 */
export interface Rankable {
  id: string
  level?: string
  media?: string
  durationMin?: number
  createdAt?: string
}

export interface RankFactor {
  /** 因子名 —— 必须出现在 `rank_reason` 里（roadmap P3-6） */
  name: string
  score: number
  detail: string
}

export interface Ranked<T> {
  item: T
  score: number
  rankReason: string
  factors: RankFactor[]
}

export function factorsOf(profile: Profile, item: Rankable): RankFactor[] {
  const levelMatched = item.level !== undefined && item.level === profile.level
  const levelFactor: RankFactor = {
    name: '水平匹配',
    score: levelMatched ? WEIGHTS.level : 0,
    detail: `资源 ${item.level ?? '未知'}，画像 ${profile.level}`,
  }

  const mediaFactor: RankFactor = mediaFactorOf(profile, item)
  const durationFactor = durationFactorOf(profile, item)

  return [levelFactor, mediaFactor, durationFactor]
}

export function scoreOfFactors(factors: readonly RankFactor[]): number {
  return factors.reduce((total, factor) => total + factor.score, 0)
}

/** `rank_reason` 的渲染：`因子名 +分数（取值） …`，可读且可断言 */
export function reasonFrom(factors: readonly RankFactor[]): string {
  return factors.map((factor) => `${factor.name} +${factor.score}（${factor.detail}）`).join(' · ')
}

export function rankReasonOf(profile: Profile, item: Rankable): string {
  return reasonFrom(factorsOf(profile, item))
}

export function scoreOf(profile: Profile, item: Rankable): number {
  return scoreOfFactors(factorsOf(profile, item))
}

/** 确定性排序：分数降序 → `created_at` 升序 → `id` 升序 */
export function rankResources<T extends Rankable>(
  profile: Profile,
  items: readonly T[],
): Ranked<T>[] {
  const ranked = items.map((item) => {
    const factors = factorsOf(profile, item)
    return {
      item,
      score: scoreOfFactors(factors),
      rankReason: reasonFrom(factors),
      factors,
    }
  })

  return ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (a.item.createdAt ?? '').localeCompare(b.item.createdAt ?? '') ||
      a.item.id.localeCompare(b.item.id),
  )
}

function mediaFactorOf(profile: Profile, item: Rankable): RankFactor {
  if (profile.mediaPreference === '不限') {
    return {
      name: '媒介偏好',
      score: WEIGHTS.media,
      detail: `画像不限，两类都接受（资源 ${item.media ?? '未知'}）`,
    }
  }

  const matched = item.media !== undefined && item.media === profile.mediaPreference
  return {
    name: '媒介偏好',
    score: matched ? WEIGHTS.media : 0,
    detail: `资源 ${item.media ?? '未知'}，画像 ${profile.mediaPreference}`,
  }
}

function durationFactorOf(profile: Profile, item: Rankable): RankFactor {
  if (item.durationMin === undefined) {
    return { name: '时长未知', score: 0, detail: '缺 duration_min' }
  }

  const budgetMin = profile.timeBudget * 60
  const fits = item.durationMin <= budgetMin
  return {
    name: '时长',
    score: fits ? WEIGHTS.duration : 0,
    detail: fits
      ? `${item.durationMin} ≤ ${budgetMin} 分钟`
      : `${item.durationMin} > ${budgetMin} 分钟`,
  }
}
