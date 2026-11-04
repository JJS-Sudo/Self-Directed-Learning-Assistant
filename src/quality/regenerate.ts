import { z } from 'zod'
import type { GoalSummary } from '../domain/goals.js'
import type { MapNodeSummary } from '../domain/nodes.js'
import type { LlmDeps } from '../llm/client.js'
import type { LlmConfig } from '../llm/config.js'
import { LlmError } from '../llm/errors.js'
import { requestJson } from '../llm/structured.js'
import { costOf } from '../runs/store.js'

export interface RegenerateCandidate {
  title: string
  parentNodeId?: string
  why?: string
}

export interface RegenerateResult {
  candidates: RegenerateCandidate[]
  usage?: { promptTokens?: number; completionTokens?: number }
  costCny?: number
  warnings: string[]
}

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        parent_node_id: z.string().optional(),
        why: z.string().optional(),
      }),
    )
    .min(1)
    .max(20),
})

/**
 * 只针对勾选的节点生成修复候选（不写库）。
 * 提示词里只出现选中节点；父节点必须真实存在，否则丢弃该父引用并警告。
 */
export async function regenerateNodes(
  config: LlmConfig,
  goal: GoalSummary,
  nodes: readonly MapNodeSummary[],
  nodeIds: readonly string[],
  deps: Partial<LlmDeps> = {},
): Promise<RegenerateResult> {
  if (nodeIds.length === 0 || nodeIds.length > 10) {
    throw new LlmError('LLM_BAD_INPUT', '一次重生成 1–10 个节点')
  }
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const selected = nodeIds.map((id) => {
    const node = byId.get(id)
    if (node === undefined) {
      throw new LlmError('LLM_BAD_INPUT', `节点不属于该目标：${id}`)
    }
    return node
  })
  const selectedIds = new Set(selected.map((node) => node.id))

  const result = await requestJson(
    config,
    {
      messages: [
        {
          role: 'system',
          content: [
            '你是学习知识拆解助手。只输出 JSON，不要解释。',
            '只重写下面列出的节点：为每个节点给出更清晰的候选标题，必要时调整父节点。',
            'parent_node_id 必须来自给出的节点或已有节点，不能编造；判断不了就省略。',
            '输出格式：{"candidates":[{"title":"…","parent_node_id":"…","why":"…"}]}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `目标：${goal.title}`,
            '需要重写的节点：',
            ...selected.map((node) => `- ${node.id} ${node.title}`),
            '父节点只能从上面这些节点里选。',
          ].join('\n'),
        },
      ],
      schema: responseSchema,
    },
    deps,
  )

  const warnings: string[] = []
  const candidates = result.value.candidates.map((candidate): RegenerateCandidate => {
    const parent = candidate.parent_node_id
    if (parent !== undefined && !selectedIds.has(parent)) {
      warnings.push(`丢弃不在选中范围内的父节点：${parent}`)
      return {
        title: candidate.title,
        ...(candidate.why === undefined ? {} : { why: candidate.why }),
      }
    }
    return {
      title: candidate.title,
      ...(parent === undefined ? {} : { parentNodeId: parent }),
      ...(candidate.why === undefined ? {} : { why: candidate.why }),
    }
  })

  const cost = costOf(result.usage)
  return {
    candidates,
    usage: result.usage,
    ...(cost === undefined ? {} : { costCny: cost }),
    warnings,
  }
}
