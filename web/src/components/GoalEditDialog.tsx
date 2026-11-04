import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { GoalListItem } from '@shared/goals'

interface Props {
  goal: GoalListItem
  onClose: () => void
  onSaved: (goal: GoalListItem) => void
}

export function GoalEditDialog({ goal, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(goal.title)
  const [kind, setKind] = useState<'常规' | '激励性'>(goal.kind === '激励性' ? '激励性' : '常规')
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [criteria, setCriteria] = useState(goal.successCriteria ?? '')
  const [status, setStatus] = useState(goal.status)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(goal.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          deadline: deadline === '' ? null : deadline,
          successCriteria: criteria.trim() === '' ? null : criteria.trim(),
          status,
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        goal?: GoalListItem
        error?: { message?: string }
      } | null
      if (!response.ok || body?.goal === undefined) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
      }
      onSaved(body.goal)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card goal-edit"
        role="dialog"
        aria-modal="true"
        aria-label="编辑目标"
        onSubmit={(event) => void submit(event)}
      >
        <p className="upcoming-label">编辑目标</p>

        <label className="field field-wide">
          <span>标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
          />
        </label>

        <div className="goal-edit-row">
          <label className="field">
            <span>类型</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as '常规' | '激励性')}
            >
              <option value="常规">常规</option>
              <option value="激励性">激励性</option>
            </select>
          </label>

          <label className="field">
            <span>状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="在用">在用</option>
              <option value="暂停">暂停</option>
              <option value="已完成">已完成</option>
              <option value="已归档">已归档</option>
            </select>
          </label>

          <label className="field">
            <span>期限{kind === '激励性' ? '' : '（可选）'}</span>
            <input
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>
        </div>

        <label className="field field-wide">
          <span>成功判据</span>
          <textarea
            rows={3}
            value={criteria}
            onChange={(event) => setCriteria(event.target.value)}
            maxLength={500}
            placeholder="一句可判定的话"
          />
        </label>

        {status === '已完成' && (
          <p className="hint">完成后不会强制验收或复盘；质量页仍会显示缺口。</p>
        )}
        {kind === '激励性' && deadline === '' && <p className="hint">激励性目标必须给期限。</p>}
        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="action-row">
          <button type="submit" className="button" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" className="link" onClick={onClose} disabled={saving}>
            取消
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
