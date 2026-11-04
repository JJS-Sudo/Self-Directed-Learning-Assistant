import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { GoalListItem } from '@shared/goals'
import type { MapCandidate, MapCandidateEdge, MapEstimate } from '@shared/map'
import { CandidateEditor } from '../components/CandidateEditor'

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string }
  } | null
  return body?.error?.message ?? `HTTP ${response.status}`
}

export function MaterialMapPage() {
  const [params] = useSearchParams()
  const initialGoal = params.get('goal') ?? ''
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [goalId, setGoalId] = useState(initialGoal)
  const [material, setMaterial] = useState('')
  const [estimate, setEstimate] = useState<MapEstimate | null>(null)
  const [candidates, setCandidates] = useState<MapCandidate[] | null>(null)
  const [edges, setEdges] = useState<MapCandidateEdge[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState<null | 'estimate' | 'preview' | 'commit'>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/goals')
      if (!response.ok) return
      const body = (await response.json()) as { goals: GoalListItem[] }
      setGoals(body.goals)
      if (goalId === '' && body.goals[0] !== undefined) setGoalId(body.goals[0].id)
    })()
  }, [goalId])

  const post = async (path: string, body?: unknown): Promise<Response> =>
    fetch(path, {
      method: 'POST',
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })

  const runEstimate = async (): Promise<void> => {
    setError(null)
    setBusy('estimate')
    try {
      const response = await post(`/api/goals/${goalId}/map/estimate`, { material })
      if (!response.ok) throw new Error(await readError(response))
      setEstimate((await response.json()) as MapEstimate)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const runPreview = async (): Promise<void> => {
    setError(null)
    setBusy('preview')
    try {
      const response = await post(`/api/goals/${goalId}/map/preview`, { material })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as {
        candidates: MapCandidate[]
        edges?: MapCandidateEdge[]
        warnings: string[]
        estimate: MapEstimate
      }
      setCandidates(body.candidates)
      setEdges(body.edges ?? [])
      setWarnings(body.warnings)
      setEstimate(body.estimate)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const runCommit = async (): Promise<void> => {
    if (candidates === null) return
    setError(null)
    setBusy('commit')
    try {
      const response = await post(`/api/goals/${goalId}/map/commit`, { candidates, edges })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { created: number; links?: number }
      setCandidates(null)
      setEdges([])
      setWarnings([])
      setNotice(`已创建 ${body.created} 个节点、${body.links ?? 0} 条关系`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const canRun = goalId !== '' && material.trim() !== '' && busy === null

  return (
    <section className="area">
      <p>
        <Link to="/map" className="link">
          ← 返回地图
        </Link>
      </p>
      <h1 className="area-title">导入材料生成</h1>
      <p className="lede">粘贴教材目录或大纲，按章节拆知识点；不联网、按材料生成。</p>

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

          <label className="field field-wide">
            <span>材料</span>
            <textarea
              rows={8}
              value={material}
              onChange={(event) => setMaterial(event.target.value)}
              placeholder={'第一章 模型\n1.1 总体回归函数\n1.2 样本回归函数\n…'}
            />
          </label>

          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={!canRun}
              onClick={() => void runEstimate()}
            >
              {busy === 'estimate' ? '估算中…' : '估算成本'}
            </button>
            <button
              type="button"
              className="button"
              disabled={!canRun}
              onClick={() => void runPreview()}
            >
              {busy === 'preview' ? '生成中…' : '生成候选'}
            </button>
            {estimate !== null && (
              <span className="hint">
                约 {estimate.inputTokens + estimate.outputTokens} token · ¥{estimate.costCny}
              </span>
            )}
          </div>

          {error !== null && <p className="form-error">{error}</p>}
          {notice !== null && <p className="hint">{notice}</p>}
        </div>
      )}

      {candidates !== null && (
        <div className="preview">
          <p className="upcoming-label">
            候选节点（{candidates.length}）· 关系（{edges.length}）
          </p>
          {warnings.length > 0 && (
            <ul className="warning-list">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <CandidateEditor candidates={candidates} onChange={setCandidates} />
          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void runCommit()}
            >
              {busy === 'commit' ? '正在写入…' : '确认落盘'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setCandidates(null)
                setEdges([])
                setWarnings([])
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
