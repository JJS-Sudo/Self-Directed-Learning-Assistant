import { useCallback, useEffect, useState } from 'react'
import type { GoalListItem } from '@shared/goals'
import type { MapNodeDto } from '@shared/map'
import type { ResourceCandidateDto, ResourcePreviewDto, ResourceViewDto } from '@shared/resources'
import { ResourceCandidateList } from '../components/ResourceCandidateList'
import { streamAutoResources, type AutoResourceEvent } from '../lib/stream'

type Busy = null | 'search' | 'commit' | 'auto'
type ResourceFilter = 'all' | 'verified' | 'unverified'

interface AutoProgress {
  done: number
  total: number
  nodeTitle: string
}

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
  const [filter, setFilter] = useState<ResourceFilter>('all')
  const [autoProgress, setAutoProgress] = useState<AutoProgress | null>(null)

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
      else next.add(id)
      return next
    })
  }

  const runAutoFill = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy('auto')
    setAutoProgress(null)
    try {
      await streamAutoResources(goalId, { mode: 'fill' }, (event: AutoResourceEvent) => {
        if (event.type === 'start') {
          setAutoProgress({ done: 0, total: event.total ?? 0, nodeTitle: '' })
        } else if (event.type === 'progress') {
          setAutoProgress({
            done: event.done ?? 0,
            total: event.total ?? 0,
            nodeTitle: event.nodeTitle ?? '',
          })
        } else if (event.type === 'warning' && event.message !== undefined) {
          setNotice(event.message)
        } else if (event.type === 'done') {
          setNotice(
            `自动补齐：新增 ${event.created ?? 0} 条、共享 ${event.linked ?? 0} 条、跳过 ${
              event.skipped ?? 0
            } 条${(event.failures ?? 0) > 0 ? `、${event.failures} 个节点未找到` : ''}`,
          )
        } else if (event.type === 'error') {
          setError(event.message ?? '自动补齐失败')
        }
      })
      await loadResources(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
      setAutoProgress(null)
    }
  }

  const removeResource = async (id: string, title: string): Promise<void> => {
    if (!window.confirm(`删除资源「${title}」？`)) return
    setError(null)
    try {
      const response = await fetch(`/api/resources/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readError(response))
      setNotice(`已删除「${title}」`)
      await loadResources(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    }
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

  const visibleResources = (view?.resources ?? []).filter((resource) => {
    if (filter === 'all') return true
    return filter === 'unverified' ? resource.unverified === true : resource.unverified !== true
  })

  return (
    <section className="area">
      <h1 className="area-title">资源</h1>
      <p className="lede">路径落盘后会自动为每个节点找资源；这里用于总览、手动补检与删除。</p>

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
            <p className="upcoming-label">选节点手动检索（不限个数）</p>
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
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void runAutoFill()}
            >
              {busy === 'auto' ? '补齐中…' : '补齐缺失资源'}
            </button>
          </div>

          {busy === 'auto' && autoProgress !== null && (
            <div className="resource-progress" aria-live="polite">
              <p className="hint">
                正在为 {autoProgress.done}/{autoProgress.total} 个节点找资源
                {autoProgress.nodeTitle === '' ? '' : `：${autoProgress.nodeTitle}`}
              </p>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width:
                      autoProgress.total === 0
                        ? '0%'
                        : `${Math.round((autoProgress.done / autoProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

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
        <div className="resource-overview-head">
          <p className="upcoming-label">
            已收录资源（{view?.resources.length ?? 0} 条）
            {view === null
              ? ''
              : ` · 画像：${view.profile.level} / ${view.profile.mediaPreference} / 每周 ${view.profile.timeBudget} 小时`}
          </p>
          <label className="field">
            <span>筛选</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as ResourceFilter)}
            >
              <option value="all">全部</option>
              <option value="verified">已验证</option>
              <option value="unverified">未验证（搜索页）</option>
            </select>
          </label>
        </div>

        {view !== null && view.resources.length === 0 && (
          <p className="hint">还没有资源。生成路径后会自动补齐，也可以在上方手动检索。</p>
        )}

        <ul className="resource-list">
          {visibleResources.map((resource) => (
            <li key={resource.id} className="resource-item">
              <p className="resource-head">
                <span className="resource-item-title">{resource.title}</span>
                {resource.unverified === true && <span className="badge-warn">未验证</span>}
                <span className="phase-tag">{resource.media}</span>
                <span className="phase-tag">{resource.level}</span>
                {resource.durationMin !== undefined && (
                  <span className="hint">{resource.durationMin} 分钟</span>
                )}
                <span className="resource-score">{resource.score.toFixed(2)}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => void removeResource(resource.id, resource.title)}
                >
                  删除
                </button>
              </p>
              {resource.url !== undefined && (
                <a className="resource-url" href={resource.url} target="_blank" rel="noreferrer">
                  {resource.url}
                </a>
              )}
              <p className="rank-reason">
                {resource.nodeTitle === undefined ? '' : `节点：${resource.nodeTitle}`}
                {(resource.nodeIds?.length ?? 0) > 1 ? ` 等 ${resource.nodeIds.length} 个节点` : ''}
                {resource.nodeTitle === undefined ? '' : ' · '}
                {resource.rankReason}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
