import { useEffect, useState } from 'react'
import type { KeysViewDto } from '@shared/settings'

type Busy = null | 'deepseek' | 'tavily'

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

function statusText(status: KeysViewDto['deepseek']): string {
  if (!status.configured) return '未配置'
  const source = status.source === 'env' ? '来自环境变量' : '页面保存'
  return `已配置（${status.mask ?? '••••'}，${source}）`
}

export function SettingsPage() {
  const [view, setView] = useState<KeysViewDto | null>(null)
  const [deepseek, setDeepseek] = useState('')
  const [tavily, setTavily] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const response = await fetch('/api/settings/keys')
    if (!response.ok) throw new Error(await readError(response))
    setView((await response.json()) as KeysViewDto)
  }

  useEffect(() => {
    void (async () => {
      try {
        await load()
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [])

  const save = async (field: 'deepseek' | 'tavily', value: string | null): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy(field)
    try {
      const response = await fetch('/api/settings/keys', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setView((await response.json()) as KeysViewDto)
      if (value === null) {
        setNotice(field === 'deepseek' ? '已清除 DeepSeek key' : '已清除 Tavily key')
      } else {
        setNotice('已保存；下一次生成/检索立刻生效')
      }
      if (field === 'deepseek') setDeepseek('')
      else setTavily('')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const rows = [
    {
      field: 'deepseek' as const,
      label: 'DeepSeek（知识地图 / 路径 / 元数据）',
      placeholder: 'sk-...',
      value: deepseek,
      setValue: setDeepseek,
      status: view?.deepseek,
    },
    {
      field: 'tavily' as const,
      label: 'Tavily（资源检索）',
      placeholder: 'tvly-...',
      value: tavily,
      setValue: setTavily,
      status: view?.tavily,
    },
  ]

  return (
    <section className="area">
      <h1 className="area-title">API Key</h1>
      <p className="lede">
        填在这里的 key 存在库根的 <code>.sdl-secrets.json</code>，不会进导出包、也不会回显明文。
      </p>
      <p className="hint">
        环境变量优先：如果启动时已经设了 <code>DEEPSEEK_API_KEY</code> / <code>TAVILY_API_KEY</code>
        ， 页面里的值不会覆盖它。
      </p>

      {rows.map((row) => (
        <div className="settings-row" key={row.field}>
          <p className="upcoming-label">{row.label}</p>
          <p className="hint">{statusText(row.status ?? { configured: false })}</p>
          <div className="settings-input">
            <input
              type="password"
              aria-label={`${row.label} 的 key`}
              placeholder={row.placeholder}
              value={row.value}
              onChange={(event) => row.setValue(event.target.value)}
            />
            <button
              type="button"
              className="button"
              disabled={busy !== null || row.value.trim() === ''}
              onClick={() => void save(row.field, row.value.trim())}
            >
              {busy === row.field ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              className="link"
              disabled={busy !== null || !(row.status?.configured ?? false)}
              onClick={() => void save(row.field, null)}
            >
              清除
            </button>
          </div>
        </div>
      ))}

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice !== null && <p className="hint">{notice}</p>}
    </section>
  )
}
