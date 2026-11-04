import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { readIndexStatus } from '../index-db/status.js'
import type { HealthReport } from '../shared/health.js'
import { inspectVault } from '../vault/paths.js'

const DEFAULT_MODEL = 'deepseek-chat'
const VERSION_FALLBACK = '0.0.0'

export interface BuildHealthInput {
  /** 解析后的库根；解析失败时为 null */
  root: string | null
  env: NodeJS.ProcessEnv
  /** 库路径解析失败的原因；仅 root 为 null 时有意义 */
  error?: string
}

/**
 * 读版本号：优先 `SDL_APP_VERSION`（桌面主进程注入），否则从工作目录的 package.json 读。
 * **刻意不用 import.meta / createRequire**——桌面主进程被打成 CJS 后它们不可用。
 */
function readVersion(): string {
  const fromEnv = (process.env['SDL_APP_VERSION'] ?? '').trim()
  if (fromEnv !== '') return fromEnv
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: unknown
    }
    return typeof pkg.version === 'string' && pkg.version !== '' ? pkg.version : VERSION_FALLBACK
  } catch {
    return VERSION_FALLBACK
  }
}

function readModel(env: NodeJS.ProcessEnv): HealthReport['model'] {
  const key = env['DEEPSEEK_API_KEY']
  const configured = typeof key === 'string' && key.trim() !== ''
  const configuredModel = env['SDL_LLM_MODEL']
  const model =
    typeof configuredModel === 'string' && configuredModel.trim() !== ''
      ? configuredModel.trim()
      : DEFAULT_MODEL

  return { configured, provider: 'deepseek', model }
}

function readVault(root: string | null, error?: string): HealthReport['vault'] {
  if (root === null) {
    return {
      ok: false,
      marked: false,
      name: '（未配置）',
      ...(error !== undefined ? { error } : {}),
    }
  }

  const name = basename(root) === '' ? root : basename(root)

  try {
    const state = inspectVault(root)
    return {
      ok: state.exists && state.isDirectory && state.marked,
      marked: state.marked,
      name,
    }
  } catch (cause) {
    return {
      ok: false,
      marked: false,
      name,
      error: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

/**
 * 组装自检报告。**纯函数**：不读全局状态、不抛错，便于测试。
 * 任何异常都折成 `vault.ok = false` + `error`，保证端点永远 200（mission R5：无库/无 key 也要能降级运行）。
 */
export function buildHealthReport(input: BuildHealthInput): HealthReport {
  const index =
    input.root === null
      ? { status: 'absent' as const, note: '库未配置，无法检查索引' }
      : readIndexStatus(input.root)

  return {
    service: 'self-directed-learning',
    version: readVersion(),
    vault: readVault(input.root, input.error),
    index: { status: index.status, note: index.note },
    model: readModel(input.env),
  }
}
