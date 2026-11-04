import type { RawCandidate, RawEdge } from './types.js'

export interface MergedCandidates {
  candidates: RawCandidate[]
  warnings: string[]
}

export interface MergedGraph extends MergedCandidates {
  edges: RawEdge[]
}

export interface RawChunk {
  candidates: readonly RawCandidate[]
  edges?: readonly RawEdge[]
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ')
}

/** 模型偶尔会发明一个「虚拟根」；它不是真实节点，按顶层处理 */
const VIRTUAL_ROOTS = new Set(['0', 'n0', 'root', 'none', 'null', ''])

/**
 * 合并各块：temp id 加块前缀、标题去重、父引用悬空降顶层；
 * 同时把候选边映射到合并后的 id（parent 冲突降级为 related）。
 */
export function mergeGraph(chunks: readonly RawChunk[]): MergedGraph {
  const warnings: string[] = []
  const byTitle = new Map<string, RawCandidate>()
  const alias = new Map<string, string>()
  const ordered: RawCandidate[] = []
  const rawParentById = new Map<string, string>()
  const rawEdges: { from: string; to: string; type: RawEdge['type'] }[] = []

  chunks.forEach((chunk, chunkIndex) => {
    const prefix = (id: string): string => `${chunkIndex + 1}-${id}`

    for (const raw of chunk.candidates) {
      const title = normalizeTitle(raw.title)
      if (title === '') {
        warnings.push('候选里有空标题，已忽略')
        continue
      }

      const id = prefix(raw.tempId)
      const parentId = raw.parentTempId === undefined ? undefined : prefix(raw.parentTempId)
      const candidate: RawCandidate = {
        tempId: id,
        title,
        ...(parentId === undefined ? {} : { parentTempId: parentId }),
        ...(raw.why === undefined ? {} : { why: raw.why }),
      }
      if (raw.parentTempId !== undefined) rawParentById.set(id, raw.parentTempId)

      const existing = byTitle.get(title)
      if (existing !== undefined) {
        alias.set(id, existing.tempId)
        warnings.push(`重复标题已合并：${title}`)
        continue
      }

      byTitle.set(title, candidate)
      ordered.push(candidate)
    }

    for (const edge of chunk.edges ?? []) {
      rawEdges.push({
        from: prefix(edge.fromTempId),
        to: prefix(edge.toTempId),
        type: edge.type,
      })
    }
  })

  const byId = new Map(ordered.map((candidate) => [candidate.tempId, candidate]))

  for (const candidate of ordered) {
    const parent = candidate.parentTempId
    if (parent === undefined) continue

    const target = alias.get(parent) ?? parent
    if (byId.has(target)) {
      candidate.parentTempId = target
      continue
    }

    const rawParent = rawParentById.get(candidate.tempId)
    if (rawParent !== undefined && VIRTUAL_ROOTS.has(rawParent.toLowerCase())) {
      delete candidate.parentTempId
      continue
    }

    delete candidate.parentTempId
    warnings.push(`父节点不存在，已降为顶层：${candidate.title}`)
  }

  const edges: RawEdge[] = []
  const seen = new Set<string>()
  for (const raw of rawEdges) {
    const from = alias.get(raw.from) ?? raw.from
    const to = alias.get(raw.to) ?? raw.to
    if (from === to) continue
    const fromNode = byId.get(from)
    const toNode = byId.get(to)
    if (fromNode === undefined || toNode === undefined) {
      warnings.push(`丢弃引用了不存在候选的关系边：${raw.from} → ${raw.to}`)
      continue
    }

    if (raw.type === 'parent') {
      if (fromNode.parentTempId === undefined) {
        fromNode.parentTempId = to
        continue
      }
      if (fromNode.parentTempId === to) continue
      warnings.push(`「${fromNode.title}」已有上级，边已改为相关`)
      const key = `related:${[from, to].sort().join('|')}`
      if (!seen.has(key)) {
        seen.add(key)
        edges.push({ fromTempId: from, toTempId: to, type: 'related' })
      }
      continue
    }

    const key = `${raw.type}:${[from, to].sort().join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ fromTempId: from, toTempId: to, type: raw.type })
  }

  return { candidates: ordered, edges, warnings }
}

/** 兼容旧调用：只要候选、不要边 */
export function mergeCandidates(chunks: readonly (readonly RawCandidate[])[]): MergedCandidates {
  const merged = mergeGraph(chunks.map((candidates) => ({ candidates })))
  return { candidates: merged.candidates, warnings: merged.warnings }
}
