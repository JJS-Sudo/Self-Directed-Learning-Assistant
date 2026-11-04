import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { GoalListItem } from '@shared/goals'
import { HealthCard } from '../components/HealthCard'
import { LlmPing } from '../components/LlmPing'

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; goals: GoalListItem[] }
  | { kind: 'error'; message: string }

interface FormState {
  title: string
  kind: '常规' | '激励性'
  deadline: string
  successCriteria: string
}

const EMPTY_FORM: FormState = { title: '', kind: '常规', deadline: '', successCriteria: '' }

export function GoalsPage() {
  const [state, setState] = useState<ListState>({ kind: 'loading' })
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/goals')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = (await response.json()) as { goals: GoalListItem[] }
      setState({ kind: 'ready', goals: body.goals })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setSubmitting(true)

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          kind: form.kind,
          ...(form.deadline === '' ? {} : { deadline: form.deadline }),
          ...(form.successCriteria.trim() === ''
            ? {}
            : { successCriteria: form.successCriteria.trim() }),
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setFormError(body?.error?.message ?? `HTTP ${response.status}`)
        return
      }

      setForm(EMPTY_FORM)
      await load()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="area">
      <h1 className="area-title">目标</h1>
      <p className="lede">每个目标是一份学习契约：一句可判定的话，加一个期限。</p>

      <form className="goal-form" onSubmit={(event) => void submit(event)}>
        <label className="field field-wide">
          <span>标题</span>
          <input
            name="title"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="例如：三天掌握一元线性回归"
            maxLength={200}
            required
          />
        </label>

        <label className="field">
          <span>类型</span>
          <select
            name="kind"
            value={form.kind}
            onChange={(event) =>
              setForm({ ...form, kind: event.target.value as FormState['kind'] })
            }
          >
            <option value="常规">常规</option>
            <option value="激励性">激励性</option>
          </select>
        </label>

        <label className="field">
          <span>期限{form.kind === '激励性' ? '' : '（可选）'}</span>
          <input
            name="deadline"
            type="date"
            value={form.deadline}
            onChange={(event) => setForm({ ...form, deadline: event.target.value })}
          />
        </label>

        <label className="field field-wide">
          <span>成功判据（一句可判定的话）</span>
          <textarea
            name="successCriteria"
            rows={2}
            value={form.successCriteria}
            onChange={(event) => setForm({ ...form, successCriteria: event.target.value })}
            placeholder="例如：能不看笔记手算一遍 R² 并解释它为什么不是越高越好"
            maxLength={500}
          />
        </label>

        <div className="form-actions">
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? '正在创建…' : '建立目标'}
          </button>
          {form.kind === '激励性' && <span className="phase-tag">激励性必须给期限</span>}
        </div>

        {formError !== null && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
      </form>

      <div className="goal-list-wrap">
        <p className="upcoming-label">我的目标</p>

        {state.kind === 'loading' && <p className="hint">正在读取…</p>}

        {state.kind === 'error' && (
          <div className="health-error">
            <p className="hint">读取失败（{state.message}）。</p>
            <button type="button" className="button" onClick={() => void load()}>
              重试
            </button>
          </div>
        )}

        {state.kind === 'ready' && state.goals.length === 0 && (
          <p className="hint">还没有目标。用上面的表单建第一个。</p>
        )}

        {state.kind === 'ready' && state.goals.length > 0 && (
          <ul className="goal-list">
            {state.goals.map((goal) => (
              <li key={goal.id} className="goal-item">
                <span className="goal-title">{goal.title}</span>
                <span className="goal-meta">
                  <span className="phase-tag">{goal.kind}</span>
                  <span>{goal.deadline ?? '无期限'}</span>
                  {daysLeftText(goal) !== '' && (
                    <span
                      className={goal.daysLeft !== undefined && goal.daysLeft < 0 ? 'overdue' : ''}
                    >
                      {daysLeftText(goal)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <HealthCard />
      <LlmPing />
    </section>
  )
}

function daysLeftText(goal: GoalListItem): string {
  if (goal.daysLeft === undefined) return ''
  if (goal.daysLeft < 0) return `已逾期 ${Math.abs(goal.daysLeft)} 天`
  if (goal.daysLeft === 0) return '今天到期'
  return `还剩 ${goal.daysLeft} 天`
}
