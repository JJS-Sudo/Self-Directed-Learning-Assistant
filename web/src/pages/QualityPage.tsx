import { useCallback, useEffect, useState } from 'react'
import type { GoalListItem } from '@shared/goals'
import type { MapNodeDto } from '@shared/map'
import type {
  ImportResultDto,
  QualityReportDto,
  RegenerateCandidateDto,
  RegenerateResultDto,
} from '@shared/quality'

type Busy = null | 'budget' | 'regen' | 'commit' | 'import'

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

export function QualityPage() {
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [goalId, setGoalId] = useState('')
  const [report, setReport] = useState<QualityReportDto | null>(null)
  const [nodes, setNodes] = useState<MapNodeDto[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [candidates, setCandidates] = useState<RegenerateCandidateDto[] | null>(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [importResult, setImportResult] = useState<ImportResultDto | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    if (id === '') return
    const [qualityResponse, mapResponse] = await Promise.all([
      fetch(`/api/goals/${id}/quality`),
      fetch(`/api/goals/${id}/map`),
    ])
    if (!qualityResponse.ok) throw new Error(await readError(qualityResponse))
    if (!mapResponse.ok) throw new Error(await readError(mapResponse))

    const quality = (await qualityResponse.json()) as QualityReportDto
    const map = (await mapResponse.json()) as { nodes: MapNodeDto[] }
    setReport(quality)
    setNodes(map.nodes)
    setBudgetInput(quality.budget.budgetCny === undefined ? '' : String(quality.budget.budgetCny))
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
        await load(goalId)
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [goalId, load])

  const saveBudget = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy('budget')
    try {
      const budgetCny = budgetInput.trim() === '' ? null : Number(budgetInput)
      const response = await fetch(`/api/goals/${goalId}/budget`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ budgetCny }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setNotice(budgetCny === null ? '已清除预算' : `预算已设为 ¥${budgetCny}`)
      await load(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const regenerate = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setCandidates(null)
    setBusy('regen')
    try {
      const response = await fetch(`/api/goals/${goalId}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeIds: [...picked] }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as RegenerateResultDto
      setCandidates(body.candidates)
      if (body.costCny !== undefined) setNotice(`已生成修复候选，花费 ¥${body.costCny}`)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const appendCandidates = async (): Promise<void> => {
    if (candidates === null) return
    setError(null)
    setBusy('commit')
    try {
      const response = await fetch(`/api/goals/${goalId}/map/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          candidates: candidates.map((candidate, index) => ({
            tempId: `regen-${index}`,
            title: candidate.title,
            ...(candidate.parentNodeId === undefined
              ? {}
              : { parentTempId: candidate.parentNodeId }),
          })),
        }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { created: number }
      setCandidates(null)
      setPicked(new Set())
      setNotice(`已追加 ${body.created} 个修复节点`)
      await load(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const importZip = async (file: File): Promise<void> => {
    setError(null)
    setBusy('import')
    try {
      const buffer = await file.arrayBuffer()
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/zip' },
        body: buffer,
      })
      if (!response.ok) throw new Error(await readError(response))
      setImportResult((await response.json()) as ImportResultDto)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="area">
      <h1 className="area-title">质量</h1>
      <p className="lede">四类警告、生成失败、费用与预算都在这里；坏掉的部分可以只重生成那一块。</p>

      {goals.length === 0 && <p className="hint">还没有目标。先去「目标」建一个。</p>}

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

          <div className="button-row">
            <a className="button" href={`/api/export?goalId=${goalId}`}>
              导出本目标
            </a>
            <a className="button" href={`/api/export?goalId=${goalId}&canvas=1`}>
              导出（含 canvas）
            </a>
            <label className="button file-button">
              导入 zip
              <input
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file !== undefined) void importZip(file)
                }}
              />
            </label>
          </div>

          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice !== null && <p className="hint">{notice}</p>}
        </div>
      )}

      {importResult !== null && (
        <p className="hint">
          导入：新增 {importResult.imported.length} · 跳过 {importResult.skipped.length} · 失败{' '}
          {importResult.failed.length}
          {importResult.failed.length > 0 &&
            `（${importResult.failed
              .map((item) => item.path)
              .slice(0, 3)
              .join('、')}）`}
        </p>
      )}

      {report !== null && (
        <div className="quality">
          <div className="quality-block">
            <p className="upcoming-label">警告（{report.warnings.length} 条）</p>
            {report.warnings.length === 0 ? (
              <p className="hint">没有覆盖警告。</p>
            ) : (
              <ul className="warning-list">
                {report.warnings.map((warning) => (
                  <li key={`${warning.category}:${warning.message}`}>
                    <span className="phase-tag">{warning.category}</span>
                    {warning.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="quality-block">
            <p className="upcoming-label">最近失败（{report.failures.length} 条）</p>
            {report.failures.length === 0 ? (
              <p className="hint">暂无失败。</p>
            ) : (
              <ul className="warning-list">
                {report.failures.map((failure) => (
                  <li key={`${failure.at}:${failure.kind}`}>
                    {failure.at} · {failure.kind}：{failure.error ?? '未知错误'}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="quality-block">
            <p className="upcoming-label">
              费用：已花 ¥{report.budget.spentCny}
              {report.budget.budgetCny === undefined ? '' : ` / 预算 ¥${report.budget.budgetCny}`}
              {report.budget.over && <span className="over-budget"> · 已超预算</span>}
            </p>
            <div className="budget-row">
              <label className="field">
                <span>预算（元）</span>
                <input
                  aria-label="预算"
                  type="number"
                  min={0}
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(event.target.value)}
                  placeholder="留空 = 不设"
                />
              </label>
              <button
                type="button"
                className="button"
                disabled={busy !== null}
                onClick={() => void saveBudget()}
              >
                保存预算
              </button>
            </div>
            {report.runs.length > 0 && (
              <ul className="run-list">
                {report.runs.slice(0, 8).map((run) => (
                  <li key={`${run.at}:${run.kind}:${run.ok}`}>
                    {run.at} · {run.kind} · {run.ok ? '成功' : '失败'}
                    {run.costCny === undefined ? '' : ` · ¥${run.costCny}`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="quality-block">
            <p className="upcoming-label">只重生成选中的节点（最多 10 个）</p>
            <ul className="node-picker">
              {nodes.map((node) => (
                <li key={node.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(node.id)}
                      onChange={() =>
                        setPicked((current) => {
                          const next = new Set(current)
                          if (next.has(node.id)) next.delete(node.id)
                          else if (next.size < 10) next.add(node.id)
                          return next
                        })
                      }
                    />
                    {node.title}
                  </label>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <button
                type="button"
                className="button"
                disabled={busy !== null || picked.size === 0}
                onClick={() => void regenerate()}
              >
                {busy === 'regen' ? '生成中…' : '重生成选中节点'}
              </button>
            </div>

            {candidates !== null && (
              <div className="preview">
                <p className="upcoming-label">修复候选（{candidates.length} 条）</p>
                <ul className="run-list">
                  {candidates.map((candidate) => (
                    <li key={candidate.title}>
                      {candidate.title}
                      {candidate.parentNodeId === undefined
                        ? ''
                        : `（挂在 ${candidate.parentNodeId}）`}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="button"
                  disabled={busy !== null}
                  onClick={() => void appendCandidates()}
                >
                  {busy === 'commit' ? '写入中…' : '确认追加'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
