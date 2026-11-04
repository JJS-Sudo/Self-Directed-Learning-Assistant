import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GoalListItem } from '@shared/goals'
import type { MapNodeDto } from '@shared/map'
import type { GeneratedStageDto, PathEstimateDto, PathPreviewDto, PathViewDto } from '@shared/path'
import { PathStageEditor } from '../components/PathStageEditor'
import { streamAutoResources, type AutoResourceEvent } from '../lib/stream'

type Busy = null | 'estimate' | 'preview' | 'commit' | 'resources'

interface ResourceProgress {
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

export function PathPage() {
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [goalId, setGoalId] = useState('')
  const [nodes, setNodes] = useState<MapNodeDto[]>([])
  const [view, setView] = useState<PathViewDto>({ stages: [], questions: [], warnings: [] })
  const [preview, setPreview] = useState<GeneratedStageDto[] | null>(null)
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([])
  const [estimate, setEstimate] = useState<PathEstimateDto | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [progress, setProgress] = useState<ResourceProgress | null>(null)
  const [searchConfigured, setSearchConfigured] = useState<boolean | null>(null)

  const loadView = useCallback(async (id: string) => {
    if (id === '') return
    const response = await fetch(`/api/goals/${id}/path`)
    if (!response.ok) throw new Error(await readError(response))
    setView((await response.json()) as PathViewDto)
  }, [])

  const loadNodes = useCallback(async (id: string) => {
    if (id === '') return
    const response = await fetch(`/api/goals/${id}/map`)
    if (!response.ok) throw new Error(await readError(response))
    const body = (await response.json()) as { nodes: MapNodeDto[] }
    setNodes(body.nodes)
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
        await Promise.all([loadView(goalId), loadNodes(goalId)])
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [goalId, loadView, loadNodes])

  const runEstimate = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy('estimate')
    try {
      const response = await fetch(`/api/goals/${goalId}/path/estimate`, { method: 'POST' })
      if (!response.ok) throw new Error(await readError(response))
      setEstimate((await response.json()) as PathEstimateDto)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const runPreview = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy('preview')
    try {
      const response = await fetch(`/api/goals/${goalId}/path/preview`, { method: 'POST' })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as PathPreviewDto
      setPreview(body.stages)
      setPreviewWarnings(body.warnings)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const runAuto = useCallback(
    async (mode: 'fill' | 'refresh' | 'retry', nodeIds?: string[]): Promise<void> => {
      setError(null)
      setBusy('resources')
      setProgress(null)
      try {
        const handle = (event: AutoResourceEvent): void => {
          if (event.type === 'start') {
            setSearchConfigured(event.searchConfigured ?? null)
            setProgress({ done: 0, total: event.total ?? 0, nodeTitle: '' })
          } else if (event.type === 'progress') {
            setProgress({
              done: event.done ?? 0,
              total: event.total ?? 0,
              nodeTitle: event.nodeTitle ?? '',
            })
          } else if (event.type === 'warning' && event.message !== undefined) {
            setNotice(event.message)
          } else if (event.type === 'done') {
            setNotice(
              `资源：新增 ${event.created ?? 0} 条、共享 ${event.linked ?? 0} 条、跳过 ${
                event.skipped ?? 0
              } 条${(event.failures ?? 0) > 0 ? `、${event.failures} 个节点未找到` : ''}`,
            )
          } else if (event.type === 'error') {
            setError(event.message ?? '资源检索失败')
          }
        }
        await streamAutoResources(
          goalId,
          { mode, ...(nodeIds === undefined ? {} : { nodeIds }) },
          handle,
        )
        await loadView(goalId)
      } catch (cause) {
        setError(messageOf(cause))
      } finally {
        setBusy(null)
        setProgress(null)
      }
    },
    [goalId, loadView],
  )

  const runCommit = async (): Promise<void> => {
    if (preview === null) return
    setError(null)
    setBusy('commit')
    try {
      const response = await fetch(`/api/goals/${goalId}/path/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stages: preview }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { createdStages: number; createdQuestions: number }
      setPreview(null)
      setPreviewWarnings([])
      setNotice(`已创建 ${body.createdStages} 段、${body.createdQuestions} 道题`)
      await loadView(goalId)
      setBusy(null)
      await runAuto('fill')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const titleOf = (id: string): string => nodes.find((node) => node.id === id)?.title ?? id
  const questionById = new Map(view.questions.map((question) => [question.id, question]))

  return (
    <section className="area">
      <h1 className="area-title">路径</h1>
      <p className="lede">按「一次坐下来能学完」为单位排序，每段都有可判定的检验信号。</p>

      {goals.length === 0 && <p className="hint">还没有目标。先去「目标」建一个，再回来排路径。</p>}

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

          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void runEstimate()}
            >
              {busy === 'estimate' ? '估算中…' : '估算成本'}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void runPreview()}
            >
              {busy === 'preview' ? '生成中…' : '生成路径'}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy !== null || view.stages.length === 0}
              onClick={() => void runAuto('refresh')}
            >
              {busy === 'resources' ? '补齐中…' : '重新补齐资源'}
            </button>
            {estimate !== null && (
              <span className="hint">
                约 {estimate.estimatedTokens} token · ¥{estimate.costCny}（估算，{estimate.stages}{' '}
                段）
              </span>
            )}
          </div>

          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice !== null && <p className="hint">{notice}</p>}

          {busy === 'resources' && progress !== null && (
            <div className="resource-progress" aria-live="polite">
              <p className="hint">
                正在为 {progress.done}/{progress.total} 个节点找资源
                {progress.nodeTitle === '' ? '' : `：${progress.nodeTitle}`}
              </p>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width:
                      progress.total === 0
                        ? '0%'
                        : `${Math.round((progress.done / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {searchConfigured === false && (
            <p className="hint">
              未配置 Tavily，当前使用 B 站 / Bing 等搜索页链接（未验证）。
              <Link to="/settings">去配置</Link>
            </p>
          )}
        </div>
      )}

      {preview !== null && (
        <div className="preview">
          <p className="upcoming-label">
            候选路径（{preview.length} 段）—— 可改标题/估时/检验信号，删掉不想要的段
          </p>
          {previewWarnings.length > 0 && (
            <ul className="warning-list">
              {previewWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <PathStageEditor stages={preview} nodeTitle={titleOf} onChange={setPreview} />
          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy !== null || preview.length === 0}
              onClick={() => void runCommit()}
            >
              {busy === 'commit' ? '正在写入…' : '确认落盘'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setPreview(null)
                setPreviewWarnings([])
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="map-view">
        <p className="upcoming-label">学习路径（{view.stages.length} 段）</p>

        {view.warnings.length > 0 && (
          <ul className="warning-list" aria-live="polite">
            {view.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        {view.stages.length === 0 ? (
          <p className="hint">还没有路径。确认落盘后会出现在这里。</p>
        ) : (
          <div className="path-grid">
            {view.stages.map((stage) => {
              const resources = stage.resources ?? []
              const stageNodes =
                stage.nodes ?? stage.nodeIds.map((id) => ({ id, title: titleOf(id) }))
              const questions =
                stage.questions ??
                stage.questionIds
                  .map((id) => questionById.get(id))
                  .filter(
                    (question): question is NonNullable<typeof question> => question !== undefined,
                  )
              return (
                <div key={stage.id} className="path-row">
                  <article className="path-stage-card">
                    <p className="path-title">
                      <span className="stage-order">{stage.order}.</span> {stage.title}
                    </p>
                    <p className="path-meta">估时：{stage.estimate}</p>
                    {stage.deliverable !== undefined && (
                      <p className="path-meta">产物：{stage.deliverable}</p>
                    )}
                    <p className="path-meta">涉及节点：{stage.nodeIds.length} 个</p>

                    <div className="stage-resources">
                      <p className="column-title">资源（{resources.length}）</p>
                      {stageNodes.length === 0 ? (
                        <p className="hint">本段没有节点</p>
                      ) : (
                        stageNodes.map((node) => {
                          const list = resources.filter((resource) => resource.nodeId === node.id)
                          return (
                            <div className="node-resource-group" key={node.id}>
                              <p className="node-resource-title">{node.title}</p>
                              {list.length === 0 ? (
                                <p className="hint">
                                  未找到资源
                                  <button
                                    type="button"
                                    className="link"
                                    disabled={busy !== null}
                                    onClick={() => void runAuto('retry', [node.id])}
                                  >
                                    重试
                                  </button>
                                </p>
                              ) : (
                                <ul className="resource-list">
                                  {list.map((resource) => (
                                    <li key={`${resource.id}-${node.id}`}>
                                      {resource.unverified === true && (
                                        <span className="badge-warn">未验证</span>
                                      )}
                                      <span className="resource-meta">
                                        {resource.platform ?? '平台未知'} ·{' '}
                                        {resource.price ??
                                          (resource.durationMin === undefined
                                            ? '价格未知'
                                            : `${resource.durationMin} 分钟`)}
                                      </span>
                                      {resource.url === undefined ? (
                                        <span className="resource-title">{resource.title}</span>
                                      ) : (
                                        <a
                                          className="resource-title"
                                          href={resource.url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {resource.title}
                                        </a>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </article>

                  <div className="path-checks">
                    <p className="column-title">检验信号</p>
                    {stage.checks.length === 0 ? (
                      <p className="hint">暂无检验信号</p>
                    ) : (
                      <ul>
                        {stage.checks.map((check) => (
                          <li key={check}>{check}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="path-questions">
                    <p className="column-title">验收题目（{questions.length}）</p>
                    {questions.length === 0 ? (
                      <p className="hint">本段暂无验收题</p>
                    ) : (
                      <ul>
                        {questions.map((question) => (
                          <li key={question.id}>
                            <span className="phase-tag">{question.kind}</span>
                            <Link
                              to={`/assess?goal=${encodeURIComponent(goalId)}&stage=${encodeURIComponent(stage.id)}`}
                              className="question-stem"
                            >
                              {question.stem}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
