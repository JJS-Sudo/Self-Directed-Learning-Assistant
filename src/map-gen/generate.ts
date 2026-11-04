import type { GoalSummary } from '../domain/goals.js'
import type { LlmDeps } from '../llm/client.js'
import type { LlmConfig } from '../llm/config.js'
import { LlmError } from '../llm/errors.js'
import { requestJson } from '../llm/structured.js'
import { estimateCost, type CostEstimate } from './estimate.js'
import { chunkSections, splitSections } from './material.js'
import { mergeGraph, type RawChunk } from './merge.js'
import { chunkResponseSchema } from './schema.js'
import type { RawCandidate, RawEdge } from './types.js'

export interface GenerateOptions {
  chunkSections?: number
}

export interface GenerateResult {
  candidates: RawCandidate[]
  edges: RawEdge[]
  warnings: string[]
  estimate: CostEstimate
  chunks: number
}

const SYSTEM_PROMPT = [
  '你是学习知识拆解助手。只输出 JSON，不要解释。',
  '把材料片段拆成「可验证概念」节点：能单独出一道题或讲一遍的，才配一张卡。',
  '每块输出 5–12 个节点；title 是 8–24 字的中文概念名。',
  '同时给出节点之间的关系边，type 只能是：parent（上级）、sibling（并列）、related（相关）。',
  '层级：每个节点最多一个 parent 边（指向它的上级），顶层节点不要有 parent 边；',
  'sibling 表示同一层级的并列知识点；related 表示跨分支但有联系的知识点。',
  '「下级」不要单独输出 —— 它由 parent 反推。',
  '禁止发明 n0 / root 之类的虚拟根节点 —— 本章的根就是这些顶层节点。',
  '只能拆材料里真实出现的章节与小节，不得编造。',
  '输出格式：{"nodes":[{"temp_id":"n1","title":"第二章 一元线性回归"},{"temp_id":"n2","title":"最小二乘估计"}],',
  '"edges":[{"from":"n2","to":"n1","type":"parent"}]}',
].join('\n')

function userPrompt(
  goal: GoalSummary,
  chunk: readonly string[],
  index: number,
  total: number,
): string {
  const criteria = goal.successCriteria === undefined ? '（未填写）' : goal.successCriteria
  return [
    `目标：${goal.title}`,
    `成功判据：${criteria}`,
    `材料片段 ${index + 1}/${total}（共 ${chunk.length} 个小节）：`,
    chunk.map((line) => `- ${line}`).join('\n'),
  ].join('\n')
}

/**
 * 逐块生成候选。**只调用模型、不写盘**；落盘由 `persistCandidates` 做。
 * 任何一块失败都会整体抛出 —— 不返回半套候选。
 */
export async function generateCandidates(
  config: LlmConfig,
  goal: GoalSummary,
  material: string,
  options: GenerateOptions = {},
  partialDeps: Partial<LlmDeps> = {},
): Promise<GenerateResult> {
  const sections = splitSections(material)
  if (sections.length === 0) {
    throw new LlmError('LLM_BAD_INPUT', '材料是空的：请先粘贴目录或大纲')
  }

  const chunks = chunkSections(sections, options.chunkSections)
  const estimate = estimateCost(material, { chunkSections: options.chunkSections })
  const perChunk: RawChunk[] = []

  for (const [index, chunk] of chunks.entries()) {
    const response = await requestJson(
      config,
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(goal, chunk, index, chunks.length) },
        ],
        schema: chunkResponseSchema,
      },
      partialDeps,
    )

    perChunk.push({
      candidates: response.value.nodes.map((node) => ({
        tempId: node.temp_id,
        title: node.title,
        ...(node.parent_temp_id === undefined || node.parent_temp_id === null
          ? {}
          : { parentTempId: node.parent_temp_id }),
        ...(node.why === undefined ? {} : { why: node.why }),
      })),
      edges: (response.value.edges ?? []).map((edge): RawEdge => ({
        fromTempId: edge.from,
        toTempId: edge.to,
        type: edge.type,
      })),
    })
  }

  const merged = mergeGraph(perChunk)
  return {
    candidates: merged.candidates,
    edges: merged.edges,
    warnings: merged.warnings,
    estimate,
    chunks: chunks.length,
  }
}
