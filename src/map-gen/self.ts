import type { GoalSummary } from '../domain/goals.js'
import type { LlmConfig } from '../llm/config.js'
import type { LlmDeps } from '../llm/client.js'
import { requestJson } from '../llm/structured.js'
import { estimateCost } from './estimate.js'
import { mergeGraph } from './merge.js'
import { selfResponseSchema } from './schema.js'
import type { RawCandidate, RawEdge } from './types.js'
import type { ResearchContext } from './research.js'

export interface SelfGenerateResult {
  candidates: RawCandidate[]
  edges: RawEdge[]
  warnings: string[]
  estimate: ReturnType<typeof estimateCost>
  calls: number
}

const SYSTEM_PROMPT = [
  '你是学习设计师。只输出 JSON，不要解释。',
  '围绕用户的目标与成功判据，拆出 20–30 个「可验证知识点」：能单独出一道题或讲一遍的，才配一张卡。',
  '每个 title 是 8–24 字的中文概念名，层级合理，不要堆砌同义词。',
  '同时给出关系边，type 只能是 parent（上级）、sibling（并列）、related（相关）；每个节点最多一个 parent。',
  '顶层节点不要写 parent；不要发明 n0 / root 之类的虚拟根。',
  '有联网摘要时优先使用摘要中的事实与术语；摘要不足时用通用知识，不得编造具体页码、数据或引文。',
  '输出格式：{"nodes":[{"temp_id":"n1","title":"概念 A"},{"temp_id":"n2","title":"概念 B"}],',
  '"edges":[{"from":"n2","to":"n1","type":"parent"}]}',
].join('\n')

function userPrompt(goal: GoalSummary, research: ResearchContext): string {
  const criteria = goal.successCriteria ?? '（未填写）'
  const lines = [`目标：${goal.title}`, `成功判据：${criteria}`]
  if (research.used) {
    lines.push('联网摘要（来自检索，可能不完整）：', research.summary)
  } else {
    lines.push('（本次没有联网资料，请用通用知识拆解）')
  }
  lines.push('请输出 20–30 个知识点与关系边。')
  return lines.join('\n')
}

/** AI 自建：一次调用生成 20–30 个节点与带类型的边；**不落盘** */
export async function generateSelfCandidates(
  config: LlmConfig,
  goal: GoalSummary,
  research: ResearchContext,
  partialDeps: Partial<LlmDeps> = {},
): Promise<SelfGenerateResult> {
  const text = userPrompt(goal, research)
  const response = await requestJson(
    config,
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      schema: selfResponseSchema,
    },
    partialDeps,
  )

  const candidates: RawCandidate[] = response.value.nodes.map((node) => ({
    tempId: node.temp_id,
    title: node.title,
    ...(node.parent_temp_id === undefined || node.parent_temp_id === null
      ? {}
      : { parentTempId: node.parent_temp_id }),
    ...(node.why === undefined ? {} : { why: node.why }),
  }))
  const edges: RawEdge[] = (response.value.edges ?? []).map((edge) => ({
    fromTempId: edge.from,
    toTempId: edge.to,
    type: edge.type,
  }))

  const merged = mergeGraph([{ candidates, edges }])
  return {
    candidates: merged.candidates,
    edges: merged.edges,
    warnings: [...research.warnings, ...merged.warnings],
    estimate: estimateCost(text, { chunkSections: 40 }),
    calls: 1,
  }
}
