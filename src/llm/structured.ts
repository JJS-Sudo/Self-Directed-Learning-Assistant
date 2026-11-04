import type { z } from 'zod'
import { chat, type ChatRequest, type ChatUsage, type LlmDeps } from './client.js'
import type { LlmConfig } from './config.js'
import { LlmError } from './errors.js'

export interface JsonRequest<T> extends ChatRequest {
  schema: z.ZodType<T>
}

export interface JsonResult<T> {
  value: T
  model: string
  durationMs: number
  usage: ChatUsage
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function issuePaths(issues: readonly { path: PropertyKey[] }[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.map((part) => String(part)).join('.')
    return path === '' ? '(root)' : path
  })
}

/**
 * 结构化输出：zod 校验，失败时**只修复一次**（把字段路径写回给模型），
 * 仍失败就抛 `LLM_BAD_RESPONSE`，不让调用方拿到半成品。
 */
export async function requestJson<T>(
  config: LlmConfig,
  request: JsonRequest<T>,
  partialDeps: Partial<LlmDeps> = {},
): Promise<JsonResult<T>> {
  const first = await chat(config, { ...request, responseFormat: 'json_object' }, partialDeps)
  const firstParsed = request.schema.safeParse(parseJson(first.text))
  if (firstParsed.success) {
    return {
      value: firstParsed.data,
      model: first.model,
      durationMs: first.durationMs,
      usage: first.usage,
    }
  }

  const issues = firstParsed.error.issues.map((issue) => {
    const path = issue.path.map((part) => String(part)).join('.')
    return `${path === '' ? '(root)' : path}：${issue.message}`
  })

  const repair = await chat(
    config,
    {
      ...request,
      responseFormat: 'json_object',
      messages: [
        ...request.messages,
        { role: 'assistant', content: first.text },
        {
          role: 'user',
          content: `上一次输出不符合约定结构：${issues.join('；')}。请只返回修正后的合法 JSON，不要解释。`,
        },
      ],
    },
    partialDeps,
  )

  const repaired = request.schema.safeParse(parseJson(repair.text))
  if (repaired.success) {
    return {
      value: repaired.data,
      model: repair.model,
      durationMs: repair.durationMs,
      usage: repair.usage,
    }
  }

  throw new LlmError(
    'LLM_BAD_RESPONSE',
    '模型输出不符合约定结构（修复后仍失败）',
    issuePaths(repaired.error.issues),
  )
}
