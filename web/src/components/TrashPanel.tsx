import { useCallback, useEffect, useState } from 'react'

export interface TrashEntryDto {
  trashId: string
  goalId: string
  title: string
  deletedAt: string
  counts: {
    nodes: number
    stages: number
    exclusiveResources: number
    sharedResources: number
  }
}

interface Props {
  onRestored?: () => void
}

export function TrashPanel({ onRestored }: Props) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<TrashEntryDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/trash')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = (await response.json()) as { entries: TrashEntryDto[] }
      setEntries(body.entries)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const restore = async (entry: TrashEntryDto): Promise<void> => {
    if (!window.confirm(`恢复目标「${entry.title}」？`)) return
    setError(null)
    try {
      const response = await fetch(`/api/trash/${encodeURIComponent(entry.trashId)}/restore`, {
        method: 'POST',
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
      }
      setNotice(`已恢复「${entry.title}」`)
      await load()
      onRestored?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const purge = async (entry: TrashEntryDto): Promise<void> => {
    if (!window.confirm(`彻底删除「${entry.title}」？删除后不可恢复。`)) return
    setError(null)
    try {
      const response = await fetch(`/api/trash/${encodeURIComponent(entry.trashId)}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setNotice(`已彻底删除「${entry.title}」`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="trash-panel">
      <button type="button" className="trash-toggle" onClick={() => setOpen((value) => !value)}>
        回收站{entries.length > 0 ? `（${entries.length}）` : ''}
        <span>{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="trash-body">
          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice !== null && <p className="hint">{notice}</p>}
          {entries.length === 0 ? (
            <p className="hint">暂无已删除目标。</p>
          ) : (
            <ul className="trash-list">
              {entries.map((entry) => (
                <li key={entry.trashId}>
                  <div>
                    <span className="goal-title">{entry.title}</span>
                    <span className="goal-meta">
                      <span>{new Date(entry.deletedAt).toLocaleString()}</span>
                      <span>
                        {entry.counts.nodes} 节点 · {entry.counts.stages} 段 ·{' '}
                        {entry.counts.exclusiveResources} 资源
                      </span>
                    </span>
                  </div>
                  <div className="action-row">
                    <button type="button" className="link" onClick={() => void restore(entry)}>
                      恢复
                    </button>
                    <button type="button" className="link" onClick={() => void purge(entry)}>
                      彻底删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
