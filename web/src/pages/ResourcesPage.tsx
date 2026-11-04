import { useCallback, useEffect, useState } from 'react'
import type { GoalListItem } from '@shared/goals'
import type { MapNodeDto } from '@shared/map'
import type { ResourceCandidateDto, ResourcePreviewDto, ResourceViewDto } from '@shared/resources'
import { ResourceCandidateList } from '../components/ResourceCandidateList'

type Busy = null | 'search' | 'commit'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string }
  } | null
  const code = body?.error?.code
  const message = body?.error?.message ?? `HTTP ${response.status}`
  return code === undefined ? message : `${code}：${message}`
}

export function ResourcesPage() {
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [goalId, setGoalId] = useState('')
  const [nodes, setNodes] = useState<MapNodeDto[]>([])
  const [pickedNodes, setPickedNodes] = useState<Set<string>>(new Set())
  const [candidates, setCandidates] = useState<ResourceCandidateDto[] | null>(null)
  const [pickedUrls, setPickedUrls] = useState<Set<string>>(new Set())
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([])
  const [view, setView] = useState<ResourceViewDto | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadResources = useCallback(async (id: string) => {
    if (id === '') return
    const response = await fetch(`/api/goals/${id}/resources`)
    if (!response.ok) throw new Error(await readError(response))
    setView((await response.json()) as ResourceViewDto)
  }, [])

  const loadNodes = useCallback(async (id: string) => {
    if (id === '') return
    const response = await fetch(`/api/goals/${id}/map`)
    if (!response.ok) throw new Error(await readError(response))
    setNodes(((await response.json()) as { nodes: MapNodeDto[] }).nodes)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/goals')
        if (!response.ok) throw new Error(await readError(response))
        const body = (await response.json()) as { goals: GoalListItem[] }
        setGoals(body.goals)
        const first = body.goals[0]?.id
        if (first !== undefined) setGoalId((current) => (current === '' ? first : current))
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        setPickedNodes(new Set())
        setCandidates(null)
        setPreviewWarnings([])
        await Promise.all([loadNodes(goalId), loadResources(goalId)])
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [goalId, loadNodes, loadResources])

  const toggleNode = (id: string): void => {
    setPickedNodes((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < 5) next.add(id)
      return next
    })
  }

  const runSearch = async (): Promise<void> => {
    if (pickedNodes.size === 0) return
    setError(null)
    setNotice(null)
    setBusy('search')
    try {
      const response = await fetch(`/api/goals/${goalId}/resources/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeIds: [...pickedNodes] }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as ResourcePreviewDto
      setCandidates(body.candidates)
      setPickedUrls(new Set(body.candidates.map((candidate) => candidate.url)))
      setPreviewWarnings(body.warnings)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const toggleCandidate = (url: string): void => {
    setPickedUrls((current) => {
      const next = new Set(current)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const editCandidate = (url: string, patch: Partial<ResourceCandidateDto>): void => {
    setCandidates(
      (current) =>
        current?.map((candidate) =>
          candidate.url === url ? { ...candidate, ...patch } : candidate,
        ) ?? null,
    )
  }

  const runCommit = async (): Promise<void> => {
    if (candidates === null) return
    const picked = candidates.filter((candidate) => pickedUrls.has(candidate.url))
    const incomplete = picked.filter(
      (candidate) => candidate.level === undefined || candidate.media === undefined,
    )
    if (incomplete.length > 0) {
      setError(`有 ${incomplete.length} 条资源还没选等级或媒介，请补全后再落盘`)
      return
    }
    if (picked.length === 0) {
      setError('至少选一条资源')
      return
    }

    setError(null)
    setBusy('commit')
    try {
      const response = await fetch(`/api/goals/${goalId}/resources/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resources: picked.map((candidate) => ({
            nodeId: candidate.nodeId,
            title: candidate.title,
            url: candidate.url,
            level: candidate.level,
            media: candidate.media,
            ...(candidate.durationMin === undefined ? {} : { durationMin: candidate.durationMin }),
          })),
        }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as {
        created: number
        skipped: { url: string; reason: string }[]
      }
      setCandidates(null)
      setPickedUrls(new Set())
      setPreviewWarnings([])
      setNotice(
        `已落盘 ${body.created} 条` +
          (body.skipped.length > 0 ? `，跳过 ${body.skipped.length} 条重复` : ''),
      )
      if (body.skipped.length > 0) {
        setPreviewWarnings(body.skipped.map((item) => `跳过 ${item.url}：${item.reason}`))
      }
      await loadResources(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="area">
      <h1 className="area-title">资源</h1>
      <p className="lede">只收录真实存在的链接；排序理由按你的画像实时计算。</p>

      {goals.length === 0 && <p className="hint">还没有目标。先去「目标」建一个，再回来找资源。</p>}

      {goals.length > 0 && (
        <div className="map-controls">
          <label className="field">
            <span>目标</span>
            <select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>

          <div className="node-picker">
            <p className="upcoming-label">选节点检索（最多 5 个）</p>
            {nodes.length === 0 ? (
              <p className="hint">这个目标还没有知识节点，先在地图页生成。</p>
            ) : (
              <ul>
                {nodes.map((node) => (
                  <li key={node.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={pickedNodes.has(node.id)}
                        onChange={() => toggleNode(node.id)}
                      />
                      {node.title}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy !== null || pickedNodes.size === 0}
              onClick={() => void runSearch()}
            >
              {busy === 'search' ? '检索中…' : `检索候选（${pickedNodes.size} 个节点）`}
            </button>
          </div>

          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice !== null && <p className="hint">{notice}</p>}
        </div>
      )}

      {previewWarnings.length > 0 && (
        <ul className="warning-list">
          {previewWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {candidates !== null && (
        <div className="preview">
          <p className="upcoming-label">
            候选资源（{candidates.length} 条）—— 勾选后补全等级/媒介，再落盘
          </p>
          {candidates.length === 0 ? (
            <p className="hint">没搜到可用资源。换个关键词，或把画像的媒介改成「不限」。</p>
          ) : (
            <>
              <ResourceCandidateList
                candidates={candidates}
                selected={pickedUrls}
                onToggle={toggleCandidate}
                onChange={editCandidate}
              />
              <div className="action-row">
                <button
                  type="button"
                  className="button"
                  disabled={busy !== null}
                  onClick={() => void runCommit()}
                >
                  {busy === 'commit' ? '正在写入…' : `落盘所选（${pickedUrls.size} 条）`}
                </button>
                <button type="button" className="link" onClick={() => setCandidates(null)}>
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="map-view">
        <p className="upcoming-label">
          已收录资源（{view?.resources.length ?? 0} 条）
          {view === null
            ? ''
            : ` · 画像：${view.profile.level} / ${view.profile.mediaPreference} / 每周 ${view.profile.timeBudget} 小时`}
        </p>

        {view !== null && view.resources.length === 0 && (
          <p className="hint">还没有资源。检索并落盘后会出现在这里。</p>
        )}

        <ul className="resource-list">
          {view?.resources.map((resource) => (
            <li key={resource.id} className="resource-item">
              <p className="resource-head">
                <span className="resource-item-title">{resource.title}</span>
                <span className="phase-tag">{resource.media}</span>
                <span className="phase-tag">{resource.level}</span>
                {resource.durationMin !== undefined && (
                  <span className="hint">{resource.durationMin} 分钟</span>
                )}
                <span className="resource-score">{resource.score.toFixed(2)}</span>
              </p>
              {resource.url !== undefined && (
                <a className="resource-url" href={resource.url} target="_blank" rel="noreferrer">
                  {resource.url}
                </a>
              )}
              <p className="rank-reason">
                {resource.nodeTitle === undefined ? '' : `节点：${resource.nodeTitle} · `}
                {resource.rankReason}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
