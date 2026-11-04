import { useCallback, useEffect, useState } from 'react'
import type { HealthReport } from '@shared/health'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; report: HealthReport } | { kind: 'error'; message: string }

/**
 * 库 / 索引 / 模型的自检卡片。阶段 1 起就存在，阶段 2 从页面里拆成组件，
 * 挂在目标区 —— 让空库的页面里也有一块**真实**内容。
 */
export function HealthCard() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const response = await fetch('/api/health')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState({ kind: 'ready', report: (await response.json()) as HealthReport })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="health" aria-live="polite">
      <div className="health-head">
        <p className="upcoming-label">系统自检</p>
        {state.kind === 'ready' && <span className="health-version">v{state.report.version}</span>}
      </div>

      {state.kind === 'loading' && <p className="hint">正在读取 /api/health …</p>}

      {state.kind === 'error' && (
        <div className="health-error">
          <p className="hint">接口未响应（{state.message}）。确认 `npm run dev` 的两端都起来了。</p>
          <button type="button" className="button" onClick={() => void load()}>
            重试
          </button>
        </div>
      )}

      {state.kind === 'ready' && <Rows report={state.report} />}
    </div>
  )
}

function Rows({ report }: { report: HealthReport }) {
  const vaultDetail = report.vault.ok
    ? `已就绪 · ${report.vault.name}`
    : `未就绪 · ${report.vault.error ?? '缺少 .sdl-vault 标记'}`
  const indexDetail =
    report.index.status === 'ok'
      ? `正常 · ${report.index.note ?? ''}`
      : report.index.status === 'stale'
        ? `待重建 · ${report.index.note ?? ''}`
        : `未建立 · ${report.index.note ?? ''}`
  const modelDetail = report.model.configured
    ? `已配置 · ${report.model.model}`
    : `未配置 · ${report.model.model}`

  return (
    <ul className="rows">
      <Row label="库" ok={report.vault.ok} detail={vaultDetail} />
      <Row label="索引" ok={report.index.status === 'ok'} detail={indexDetail} />
      <Row label="模型" ok={report.model.configured} detail={modelDetail} />
    </ul>
  )
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="row" data-ok={ok}>
      <span className="dot" aria-hidden="true" />
      <span className="label">{label}</span>
      <span className="value">{detail}</span>
      <span className="sr-only">{ok ? '正常' : '未就绪'}</span>
    </li>
  )
}
