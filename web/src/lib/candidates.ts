/** 只需要这两个字段；不依赖共享类型，纯逻辑可以在 Node 测试里直接跑 */
export interface CandidateLike {
  tempId: string
  parentTempId?: string
}

/** 某个候选的全部后代（防止把父级设成自己的子树，形成环） */
export function descendants(candidates: readonly CandidateLike[], id: string): Set<string> {
  const result = new Set<string>()
  let frontier = [id]

  while (frontier.length > 0) {
    const next: string[] = []
    for (const candidate of candidates) {
      if (candidate.parentTempId !== undefined && frontier.includes(candidate.parentTempId)) {
        if (!result.has(candidate.tempId)) {
          result.add(candidate.tempId)
          next.push(candidate.tempId)
        }
      }
    }
    frontier = next
  }

  return result
}
