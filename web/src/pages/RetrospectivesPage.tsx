import { useCallback, useEffect, useState } from 'react'
import type { GoalListItem } from '@shared/goals'
import type { PathStageDto, PathViewDto } from '@shared/path'
import {
  MASTERY_OPTIONS,
  type AssessmentRecordDto,
  type RetrospectiveDto,
  type SessionStatsDto,
} from '@shared/assessment'

type Busy = null | 'submit'

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

interface SessionChoice {
  sessionId: string
  date: string
  count: number
}

export function RetrospectivesPage() {
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [goalId, setGoalId] = useState('')
  const [stages, setStages] = useState<PathStageDto[]>([])
  const [sessions, setSessions] = useState<SessionChoice[]>([])
  const [records, setRecords] = useState<AssessmentRecordDto[]>([])
  const [stats, setStats] = useState<SessionStatsDto | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [worked, setWorked] = useState('')
  const [failed, setFailed] = useState('')
  const [nextAdjustment, setNextAdjustment] = useState('')
  const [pickedStages, setPickedStages] = useState<Set<string>>(new Set())
  const [mastery, setMastery] = useState('在学')
  const [retros, setRetros] = useState<RetrospectiveDto[]>([])
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadGoal = useCallback(async (id: string) => {
    if (id === '') return
    const [pathResponse, assessmentsResponse, retroResponse] = await Promise.all([
      fetch(`/api/goals/${id}/path`),
      fetch(`/api/goals/${id}/assessments`),
      fetch(`/api/goals/${id}/retrospectives`),
    ])
    for (const response of [pathResponse, assessmentsResponse, retroResponse]) {
      if (!response.ok) throw new Error(await readError(response))
    }

    const path = (await pathResponse.json()) as PathViewDto
    const assessments = (await assessmentsResponse.json()) as { records: AssessmentRecordDto[] }
    const retrospectives = (await retroResponse.json()) as { retrospectives: RetrospectiveDto[] }

    setStages(path.stages)
    setRetros(retrospectives.retrospectives)

    const grouped = new Map<string, SessionChoice>()
    for (const record of assessments.records) {
      const existing = grouped.get(record.sessionId)
      if (existing === undefined) {
        grouped.set(record.sessionId, { sessionId: record.sessionId, date: record.date, count: 1 })
      } else {
        existing.count += 1
      }
    }
    const list = [...grouped.values()].slice(0, 10)
    setSessions(list)
    setSessionId(list[0]?.sessionId ?? '')
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
        await loadGoal(goalId)
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [goalId, loadGoal])

  useEffect(() => {
    if (sessionId === '') return
    void (async () => {
      try {
        const response = await fetch(`/api/goals/${goalId}/assessments?session=${sessionId}`)
        if (!response.ok) throw new Error(await readError(response))
        const body = (await response.json()) as {
          records: AssessmentRecordDto[]
          stats: SessionStatsDto
        }
        setRecords(body.records)
        setStats(body.stats)

        const anchor = body.records.find((record) => record.mode === '做题') ?? body.records[0]
        const suggested =
          anchor?.nodeId === undefined
            ? undefined
            : body.stats.suggestedMastery.find((item) => item.nodeId === anchor.nodeId)?.mastery
        if (suggested !== undefined) setMastery(suggested)
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [goalId, sessionId])

  const anchor = records.find((record) => record.mode === '做题') ?? records[0]

  const submit = async (): Promise<void> => {
    if (anchor === undefined) return
    setError(null)
    setBusy('submit')
    try {
      const response = await fetch(`/api/goals/${goalId}/retrospectives`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assessmentId: anchor.id,
          worked,
          failed,
          nextAdjustment,
          stageIds: [...pickedStages],
          mastery,
        }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { adjustEventIds: string[] }
      setNotice(
        `已写复盘，回写掌握度「${mastery}」，调整了 ${body.adjustEventIds.length} 段（段序未变）`,
      )
      setWorked('')
      setFailed('')
      setNextAdjustment('')
      setPickedStages(new Set())
      await loadGoal(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const stageTitle = (id: string): string => {
    const stage = stages.find((item) => item.id === id)
    return stage === undefined ? id : `${stage.order}. ${stage.title}`
  }

  return (
    <section className="area">
      <h1 className="area-title">复盘</h1>
      <p className="lede">把「哪里行、哪里卡住、下一步改什么」写下来；掌握度确认后才回写。</p>

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
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="hint">还没有验收记录。先去「验收」页交一次卷。</p>
      ) : (
        <div className="retro-form">
          <label className="field">
            <span>本轮验收</span>
            <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              {sessions.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>
                  {session.date} · {session.count} 条记录
                </option>
              ))}
            </select>
          </label>

          {stats !== null && (
            <p className="stats-line">
              对 {stats.correct} · 错 {stats.wrong} · 未答 {stats.unanswered}
              {anchor?.nodeId !== undefined && <span className="hint"> · 节点建议：{mastery}</span>}
            </p>
          )}

          <label className="field field-wide">
            <span>哪里行（worked）</span>
            <textarea rows={2} value={worked} onChange={(event) => setWorked(event.target.value)} />
          </label>
          <label className="field field-wide">
            <span>哪里卡住（failed）</span>
            <textarea rows={2} value={failed} onChange={(event) => setFailed(event.target.value)} />
          </label>
          <label className="field field-wide">
            <span>下一步改什么（next_adjustment）</span>
            <textarea
              rows={2}
              value={nextAdjustment}
              onChange={(event) => setNextAdjustment(event.target.value)}
            />
          </label>

          <div className="field field-wide">
            <span>这次调整了哪几段（只记录，不改段序）</span>
            <ul className="stage-picker">
              {stages.map((stage) => (
                <li key={stage.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={pickedStages.has(stage.id)}
                      onChange={() =>
                        setPickedStages((current) => {
                          const next = new Set(current)
                          if (next.has(stage.id)) next.delete(stage.id)
                          else next.add(stage.id)
                          return next
                        })
                      }
                    />
                    {stage.order}. {stage.title}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <label className="field">
            <span>掌握度（确认后回写）</span>
            <select value={mastery} onChange={(event) => setMastery(event.target.value)}>
              {MASTERY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void submit()}
            >
              {busy === 'submit' ? '提交中…' : '写复盘'}
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

      <div className="map-view">
        <p className="upcoming-label">历史复盘（{retros.length} 条）</p>
        {retros.length === 0 ? (
          <p className="hint">还没有复盘。</p>
        ) : (
          <ul className="retro-list">
            {retros.map((retro) => (
              <li key={retro.id} className="retro-item">
                <p className="retro-date">{retro.date}</p>
                <p>行：{retro.worked}</p>
                <p>卡：{retro.failed}</p>
                <p>下一步：{retro.nextAdjustment}</p>
                {retro.adjustEventIds.length > 0 && (
                  <p className="retro-events">
                    调整：{retro.adjustEventIds.map(stageTitle).join('、')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
