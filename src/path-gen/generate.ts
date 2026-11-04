import type { GoalSummary } from '../domain/goals.js'
import type { MapNodeSummary } from '../domain/nodes.js'
import type { LlmDeps } from '../llm/client.js'
import type { LlmConfig } from '../llm/config.js'
import { LlmError } from '../llm/errors.js'
import { requestJson } from '../llm/structured.js'
import { pathResponseSchema } from './schema.js'
import type { GeneratePathResult, GeneratedQuestion, GeneratedStage } from './types.js'

const SYSTEM_PROMPT = [
  '你是学习路径规划助手。只输出 JSON，不要解释。',
  '输入是一个目标下的知识节点列表（id、标题、父节点）。',
  '把它们排成有序的学习段：一段 = 一次坐下来能学完的量（半天到一天）。',
  '硬约束：',
  '1) 每一段至少引用 1 个节点；所有「叶子节点」（没有子节点的节点）都必须至少出现在一段里；',
  '2) 每段 checks 至少 1 条，必须是可观察的动作（能画出 / 能说出 / 能算一遍 / 能对比），不要写「理解」「了解」；',
  '3) 每段 2 道题：一道 kind=封闭（必须有 answer 与 explanation），一道 kind=开放（费曼复述，不要 answer）；',
  '4) estimate 写成「约 0.5 天」「约 1 天」这种文本，不要写具体日期。',
  '输出格式：',
  '{"stages":[{"temp_id":"s1","title":"…","estimate":"约 0.5 天","node_ids":["n1"],"checks":["能画出…"],"questions":[{"temp_id":"q1","kind":"封闭","stem":"…","answer":"…","explanation":"…","node_id":"n1"},{"temp_id":"q2","kind":"开放","stem":"用自己的话讲清…","node_id":"n1"}]}]}',
].join('\n')

function leavesOf(nodes: readonly MapNodeSummary[]): MapNodeSummary[] {
  const parents = new Set(
    nodes.map((node) => node.upId).filter((id): id is string => id !== undefined),
  )
  return nodes.filter((node) => !parents.has(node.id))
}

function nodeLines(nodes: readonly MapNodeSummary[]): string {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes
    .map((node) => {
      const parent = node.upId === undefined ? undefined : byId.get(node.upId)
      const parentSuffix = parent === undefined ? '' : `（父：${parent.title}）`
      return `- ${node.id} ${node.title}${parentSuffix}`
    })
    .join('\n')
}

function buildPrompt(
  goal: GoalSummary,
  nodes: readonly MapNodeSummary[],
  missing: readonly MapNodeSummary[],
): string {
  const criteria = goal.successCriteria ?? '（未填写）'
  const lines = [
    `目标：${goal.title}`,
    `成功判据：${criteria}`,
    `节点（共 ${nodes.length} 个，叶子 ${leavesOf(nodes).length} 个）：`,
    nodeLines(nodes),
  ]
  if (missing.length > 0) {
    lines.push(
      '上一次生成漏掉了这些叶子节点，这次必须全部覆盖：',
      missing.map((node) => `- ${node.id} ${node.title}`).join('\n'),
    )
  }
  return lines.join('\n')
}

function toStage(raw: pathResponseSchemaStage): GeneratedStage {
  return {
    tempId: raw.temp_id,
    title: raw.title,
    estimate: raw.estimate,
    nodeIds: raw.node_ids,
    checks: raw.checks,
    ...(raw.deliverable === undefined ? {} : { deliverable: raw.deliverable }),
    questions: raw.questions.map((question): GeneratedQuestion => ({
      tempId: question.temp_id,
      kind: question.kind,
      stem: question.stem,
      ...(question.answer === undefined ? {} : { answer: question.answer }),
      ...(question.explanation === undefined ? {} : { explanation: question.explanation }),
      ...(question.node_id === undefined ? {} : { nodeId: question.node_id }),
    })),
  }
}

type pathResponseSchemaStage = ReturnType<typeof pathResponseSchema.parse>['stages'][number]

/** 结构之外还必须满足的业务约束：节点必须真实、封闭题必须带答案与解析 */
function assertStages(stages: readonly GeneratedStage[], knownIds: ReadonlySet<string>): void {
  for (const stage of stages) {
    for (const nodeId of stage.nodeIds) {
      if (!knownIds.has(nodeId)) {
        throw new LlmError('LLM_BAD_RESPONSE', '路径段引用了不存在的节点', [nodeId])
      }
    }
    for (const question of stage.questions) {
      if (
        question.kind === '封闭' &&
        (question.answer === undefined || question.explanation === undefined)
      ) {
        throw new LlmError('LLM_BAD_RESPONSE', '封闭题缺少答案或解析', [question.tempId])
      }
    }
  }
}

function uncoveredLeaves(
  stages: readonly GeneratedStage[],
  nodes: readonly MapNodeSummary[],
): MapNodeSummary[] {
  const covered = new Set(stages.flatMap((stage) => stage.nodeIds))
  return leavesOf(nodes).filter((node) => !covered.has(node.id))
}

/**
 * 生成路径与题目。最多调用两次：第一次生成；若漏了叶子，带上缺口再生成一次。
 * **不写盘** —— 落盘由 `persistPath` 负责。
 */
export async function generatePath(
  config: LlmConfig,
  goal: GoalSummary,
  nodes: readonly MapNodeSummary[],
  partialDeps: Partial<LlmDeps> = {},
): Promise<GeneratePathResult> {
  if (nodes.length === 0) {
    throw new LlmError('LLM_BAD_INPUT', '这个目标还没有知识节点：先在地图页生成知识网')
  }

  const knownIds = new Set(nodes.map((node) => node.id))
  let stages: GeneratedStage[] = []
  let missing: MapNodeSummary[] = leavesOf(nodes)
  let calls = 0
  const warnings: string[] = []

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await requestJson(
      config,
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(goal, nodes, attempt === 0 ? [] : missing) },
        ],
        schema: pathResponseSchema,
      },
      partialDeps,
    )
    calls += 1
    stages = response.value.stages.map(toStage)
    assertStages(stages, knownIds)

    missing = uncoveredLeaves(stages, nodes)
    if (missing.length === 0) break
  }

  if (missing.length > 0) {
    warnings.push(
      `以下叶子节点仍未被任何路径段覆盖：${missing
        .slice(0, 6)
        .map((node) => node.title)
        .join('、')}` + (missing.length > 6 ? ` 等 ${missing.length} 项` : ''),
    )
  }

  return { stages, warnings, calls }
}
