import { useState } from 'react'
import type { LlmPingResult } from '@shared/llm'

type PingState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: LlmPingResult }
  | { kind: 'error'; code: string; message: string }

/**
 * 手动「测试连接」。**只有点击才发请求** —— 它是真实调用，会花钱。
 * 未配置时 API 返回 200 `configured:false`，这里显示配置指引而不是错误。
 */
export function LlmPing() {
  const [state, setState] = useState<PingState>({ kind: 'idle' })

  const run = async (): Promise<void> => {
    setState({ kind: 'loading' })
    try {
      const response = await fetch('/api/llm/ping', { method: 'POST' })
      const body = (await response.json().catch(() => null)) as
        (LlmPingResult & { error?: { code?: string; message?: string } }) | null

      if (!response.ok) {
        setState({
          kind: 'error',
          code: body?.error?.code ?? `HTTP ${response.status}`,
          message: body?.error?.message ?? '请求失败',
        })
        return
      }

      setState({ kind: 'done', result: body ?? { configured: false, ok: false } })
    } catch (error) {
      setState({
        kind: 'error',
        code: 'NETWORK',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="llm-ping">
      <p className="upcoming-label">模型连接</p>

      <div className="action-row">
        <button
          type="button"
          className="button"
          onClick={() => void run()}
          disabled={state.kind === 'loading'}
        >
          {state.kind === 'loading' ? '正在测试…' : '测试连接'}
        </button>
        <span className="hint">会发起一次真实的极小调用（max_tokens: 1）</span>
      </div>

      {state.kind === 'done' && !state.result.configured && (
        <p className="hint">
          未配置：设置环境变量 <code>DEEPSEEK_API_KEY</code> 后重启服务；其余参数见{' '}
          <code>SDL_LLM_*</code>。
        </p>
      )}

      {state.kind === 'done' && state.result.configured && (
        <p className="hint">
          连接正常 · {state.result.model ?? '未知模型'} · {state.result.durationMs ?? 0}ms
        </p>
      )}

      {state.kind === 'error' && (
        <p className="form-error" role="alert">
          {state.code}：{state.message}
        </p>
      )}
    </div>
  )
}
