import { useCallback, useEffect, useState } from 'react'
import type { GoalListItem } from '@shared/goals'
import type { MapNodeDto } from '@shared/map'
import type { PathQuestionDto, PathViewDto } from '@shared/path'
import {
  QUIZ_ANSWERS,
  RECITAL_ANSWERS,
  type SessionStatsDto,
  type SubmitSessionDto,
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

export function AssessmentsPage() {
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [goalId, setGoalId] = useState('')
  const [questions, setQuestions] = useState<PathQuestionDto[]>([])
  const [nodes, setNodes] = useState<MapNodeDto[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [recitalNode, setRecitalNode] = useState('')
  const [recitalText, setRecitalText] = useState('')
  const [recitalResult, setRecitalResult] = useState<string>('已完成')
  const [submitted, setSubmitted] = useState<SubmitSessionDto | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  const loadGoal = useCallback(async (id: string) => {
    if (id === '') return
    const [pathResponse, mapResponse] = await Promise.all([
      fetch(`/api/goals/${id}/path`),
      fetch(`/api/goals/${id}/map`),
    ])
    if (!pathResponse.ok) throw new Error(await readError(pathResponse))
    if (!mapResponse.ok) throw new Error(await readError(mapResponse))

    const path = (await pathResponse.json()) as PathViewDto
    const map = (await mapResponse.json()) as { nodes: MapNodeDto[] }
    setQuestions(path.questions)
    setNodes(map.nodes)
    setAnswers({})
    setSubmitted(null)
    setRecitalNode(map.nodes[0]?.id ?? '')
    setRecitalText('')
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

  const answerOf = (questionId: string): string => answers[questionId] ?? '未作答'

  const submit = async (): Promise<void> => {
    if (questions.length === 0) return
    setError(null)
    setBusy('submit')
    try {
      const payload = {
        questionIds: questions.map((question) => question.id),
        answers: questions.map((question) => ({
          questionId: question.id,
          result: answerOf(question.id),
        })),
        ...(recitalText.trim() === ''
          ? {}
          : {
              recitals: [
                {
                  nodeId: recitalNode,
                  text: recitalText,
                  result: recitalResult,
                },
              ],
            }),
      }
      const response = await fetch(`/api/goals/${goalId}/assessments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await readError(response))
      setSubmitted((await response.json()) as SubmitSessionDto)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const titleOf = (nodeId: string): string =>
    nodes.find((node) => node.id === nodeId)?.title ?? nodeId

  return (
    <section className="area">
      <h1 className="area-title">验收</h1>
      <p className="lede">逐题作答或写一段复述；没答的题也会按「未作答」记录。</p>

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

      {questions.length === 0 ? (
        <p className="hint">这个目标还没有题目。先去「路径」页生成或确认题目。</p>
      ) : (
        <div className="quiz-list">
          <p className="upcoming-label">本轮题目（{questions.length} 道）</p>
          {questions.map((question, index) => (
            <div className="quiz-row" key={question.id}>
              <p className="quiz-stem">
                {index + 1}. <span className="phase-tag">{question.kind}</span>
                {question.stem}
                {question.nodeId !== undefined && (
                  <span className="hint">（{titleOf(question.nodeId)}）</span>
                )}
              </p>
              <div className="quiz-options">
                {QUIZ_ANSWERS.map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name={question.id}
                      checked={answerOf(question.id) === option}
                      onChange={() =>
                        setAnswers((current) => ({ ...current, [question.id]: option }))
                      }
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="recital-box">
            <p className="upcoming-label">复述（可选）</p>
            <label className="field">
              <span>节点</span>
              <select value={recitalNode} onChange={(event) => setRecitalNode(event.target.value)}>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              aria-label="复述正文"
              rows={3}
              placeholder="用自己的话讲一遍……"
              value={recitalText}
              onChange={(event) => setRecitalText(event.target.value)}
            />
            <label className="field">
              <span>自评</span>
              <select
                value={recitalResult}
                onChange={(event) => setRecitalResult(event.target.value)}
              >
                {RECITAL_ANSWERS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void submit()}
            >
              {busy === 'submit' ? '交卷中…' : '交卷'}
            </button>
          </div>

          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {submitted !== null && <StatsPanel stats={submitted.stats} titleOf={titleOf} />}
    </section>
  )
}

function StatsPanel({
  stats,
  titleOf,
}: {
  stats: SessionStatsDto
  titleOf: (id: string) => string
}) {
  return (
    <div className="map-view">
      <p className="upcoming-label">本轮统计</p>
      <p className="stats-line">
        对 {stats.correct} · 错 {stats.wrong} · 未答 {stats.unanswered} · 复述完成{' '}
        {stats.recitalDone} / 未完成 {stats.recitalPending}
      </p>

      <ul className="stats-list">
        {stats.byNode.map((node) => (
          <li key={node.nodeId}>
            {titleOf(node.nodeId)}：正确率 {Math.round(node.accuracy * 100)}%（{node.correct}/
            {node.total}）
            <span className="phase-tag">
              建议{' '}
              {stats.suggestedMastery.find((item) => item.nodeId === node.nodeId)?.mastery ??
                '未学'}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">核对建议档位后，去「复盘」页确认并写一条复盘。</p>
    </div>
  )
}
