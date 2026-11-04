import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GoalSummary } from '../domain/goals.js'
import { listNodes, type MapNodeSummary } from '../domain/nodes.js'
import { listStages, type PathStageSummary } from '../domain/path-stages.js'
import { listAllQuestions, listQuestions } from '../domain/questions.js'
import { goalAreaRelativePath } from '../vault/goal-areas.js'
import { wikilink } from '../vault/document.js'
import { assertVaultUsable, resolveInsideVault } from '../vault/paths.js'
import { buildGridCanvas, serializeCanvas, type Canvas, type GridRow } from './canvas.js'
import { GENERATED_NOTICE, type GeneratedArtifact } from './knowledge-map.js'
import { buildStageResources, type StageResourceResolver } from './stage-resources.js'

/**
 * 学习路径生成器：读 `学习路径/` 的段实体（＋它引用的题目、涉及的节点、配套资源）
 * → 写 `学习路径.md` + `学习路径.canvas`。
 *
 * 形态（2026-10-10 起）：
 * - canvas：**方正三列表格**（阶段 / 检验信号 / 验收题目），顶部表头行、统一行高；
 *   **配套资源并入阶段卡**，给紧凑理由
 * - md：总览表（含「配套资源」列）＋ 每段一张**同构**两列表（六项），配套资源给**完整理由**
 * - 配套关系是**推导**出来的：资源的 `node` 与段的某个 `node` 在同一条根→叶路径上即配套，
 *   **不需要看懂资源内容**
 */

export interface LearningPathResult {
  stageCount: number
  canvas: Canvas
  md: string
  artifacts: GeneratedArtifact[]
}

const COLUMN_WIDTHS = [320, 380, 320]

/** `水平匹配 +3（资源 入门，画像 入门） · 媒介偏好 +2（…）` → `水平+3 媒介+2` */
export function compactReason(reason: string): string {
  return reason
    .split(' · ')
    .map((part) =>
      part.replace(/（.*$/, '').replace('匹配', '').replace('偏好', '').replace(/\s+/g, ''),
    )
    .join(' ')
}

/** 某段的配套资源：与段内任一节点在同一条根→叶路径上者，按三因子排序（实现见 stage-resources.ts） */
export type { StageResourceResolver } from './stage-resources.js'

export function buildLearningPath(root: string, goal: GoalSummary): LearningPathResult {
  const stages = listStages(root, goal.id)
  const questions = listQuestions(root, goal.id)
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const fallback = new Map(listAllQuestions(root).map((question) => [question.id, question]))

  const nodes = listNodes(root, goal.id)
  const { ofStage: resourcesOfStage } = buildStageResources(root, goal)

  const rows: GridRow[] = [
    {
      key: 'header',
      header: true,
      cells: [
        { key: 'header-stage', title: '阶段', detail: '段序 · 阶段 · 估时', color: '6' },
        { key: 'header-check', title: '检验信号', detail: '能不能往下走的判据', color: '3' },
        { key: 'header-question', title: '验收题目', detail: '跟在本段后面', color: '2' },
      ],
    },
  ]

  for (const stage of stages) {
    const stageResources = resourcesOfStage(stage)
    const questionCards = stage.questionIds.map((questionId) => {
      const question = questionById.get(questionId) ?? fallback.get(questionId)
      return {
        key: `question:${questionId}`,
        title: `题目 · ${question?.title ?? questionId}`,
        detail: [
          question === undefined ? '（题目实体缺失）' : question.stem,
          ...(question?.answer === undefined ? [] : [`答案：${question.answer}`]),
        ].join('\n'),
        color: '2' as const,
      }
    })

    rows.push({
      key: stage.id,
      cells: [
        {
          key: stage.id,
          title: `${stage.order}. ${stage.title}`,
          detail: [
            `估时：${stage.estimate}`,
            ...(stage.deliverable === undefined ? [] : [`产出物：${stage.deliverable}`]),
            `涉及节点：${stage.nodeIds.length} 个`,
            '资源（按推荐排序）：',
            ...(stageResources.length === 0
              ? ['· （本段暂无配套资源）']
              : stageResources.map(
                  (resource) =>
                    `· ${resource.title}（${resource.media} · ${resource.durationMin ?? '?'} 分钟）` +
                    `｜理由：${compactReason(resource.rankReason)}`,
                )),
          ].join('\n'),
          color: '4',
        },
        {
          key: `check:${stage.id}`,
          title: '检验信号',
          detail: stage.checks.map((check) => `· ${check}`).join('\n'),
          color: '3',
        },
        questionCards.length === 0
          ? {
              key: `none:${stage.id}`,
              title: '（本段未配题目）',
              detail: '可补一道题，或直接人工自问自答',
            }
          : {
              key: `questions:${stage.id}`,
              title: `验收题目（${questionCards.length} 道）`,
              detail: questionCards
                .map((card) => `· ${card.title.replace(/^题目 · /, '')}\n${card.detail}`)
                .join('\n\n'),
              color: '2' as const,
            },
      ],
    })
  }

  const { canvas } = buildGridCanvas(rows, {
    colWidths: COLUMN_WIDTHS,
    colGap: 60,
    rowGap: 70,
    uniformRowHeight: true,
  })

  const minY = canvas.nodes.reduce((min, node) => Math.min(min, node.y), 0)
  canvas.nodes.unshift({
    id: 'notice',
    type: 'text',
    text:
      '**本图由 npm run maps 生成**\n' +
      '方正三列：阶段 / 检验信号 / 验收题目；**配套资源写在阶段卡里**（理由为紧凑写法）。\n' +
      '配套关系按**节点归属**推导（资源挂的节点与段涉及的节点在同一条根→叶路径上），**没有审过资源内容**。',
    x: 0,
    y: minY - 180,
    width: 1000,
    height: 120,
  })

  const md = renderLearningPathMd(goal, stages, nodes, resourcesOfStage)

  return {
    stageCount: stages.length,
    canvas,
    md,
    artifacts: [
      {
        relativePath: join(goalAreaRelativePath(goal), '学习路径.canvas'),
        content: serializeCanvas(canvas),
      },
      { relativePath: join(goalAreaRelativePath(goal), '学习路径.md'), content: md },
    ],
  }
}

export function writeLearningPath(rootInput: string, goal: GoalSummary): LearningPathResult {
  const root = assertVaultUsable(rootInput)
  const result = buildLearningPath(root, goal)
  for (const artifact of result.artifacts) {
    writeFileSync(resolveInsideVault(root, artifact.relativePath), artifact.content, 'utf8')
  }
  return result
}

/** 每段那张同构两列表的**固定字段顺序** */
export const STAGE_FIELDS = [
  '估时',
  '涉及节点',
  '产出物',
  '✅ 检验信号',
  '题目与提问',
  '配套资源',
] as const

export function renderLearningPathMd(
  goal: GoalSummary,
  stages: PathStageSummary[],
  nodes: MapNodeSummary[],
  resourcesOfStage: StageResourceResolver,
): string {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  // 必须走 `wikilink()`：它会清洗标题里的 wikilink 语法字符（`|` `[` `]`），
  // 手拼 `[[id 标题|标题]]` 会在标题含 `|` 时生成 Obsidian 解析不了的链接
  const linkOf = (id: string): string => {
    const node = nodeById.get(id)
    return node === undefined ? `[[${id}]]` : wikilink(node.id, node.title)
  }

  // ── 一、总览表（多一列「配套资源」，写条数） ──
  const overview = stages
    .map(
      (stage) =>
        `| ${stage.order} | ${stage.title} | ${stage.estimate} | ${stage.nodeIds
          .map((id) => `\`${id}\``)
          .join('<br>')} | ${stage.checks.length} 条 | ${
          stage.questionIds.length === 0 ? '（无）' : `${stage.questionIds.length} 道`
        } | ${resourcesOfStage(stage).length} 条 |`,
    )
    .join('\n')

  // ── 二、逐段展开（每段一张同构两列表，六项） ──
  const sections = stages
    .map((stage) => {
      const stageResources = resourcesOfStage(stage)
      const cells: Record<(typeof STAGE_FIELDS)[number], string> = {
        估时: stage.estimate,
        涉及节点:
          stage.nodeIds.length === 0
            ? '（无）'
            : stage.nodeIds.map((id) => linkOf(id)).join('<br>'),
        产出物: stage.deliverable ?? '（未写）',
        '✅ 检验信号':
          stage.checks.length === 0
            ? '（无）'
            : stage.checks.map((check, index) => `${index + 1}. ${check}`).join('<br>'),
        题目与提问:
          stage.questionIds.length === 0
            ? '（本段未配题目）'
            : stage.questionIds.map((id) => `[[${id}]]`).join('<br>'),
        配套资源:
          stageResources.length === 0
            ? '（本段暂无配套资源）'
            : stageResources
                .map(
                  (resource) =>
                    `${wikilink(resource.id, resource.title)}（${resource.media} · ${
                      resource.durationMin ?? '?'
                    } 分钟）<br>理由：${resource.rankReason}`,
                )
                .join('<br>'),
      }

      const rows = STAGE_FIELDS.map((field) => `| ${field} | ${cells[field]} |`).join('\n')

      return `### 第 ${stage.order} 段 · ${stage.title}

| 项 | 内容 |
|---|---|
${rows}
`
    })
    .join('\n')

  const checklist = stages.map((stage) => `- [ ] 第 ${stage.order} 段 · ${stage.title}`).join('\n')

  const crossRef = stages
    .map(
      (stage) =>
        `| \`${stage.id}\` | ${stage.title} | ${stage.nodeIds.map((id) => `\`${id}\``).join('、')} |`,
    )
    .join('\n')

  return `# ${goal.title} · 学习路径

> ${GENERATED_NOTICE}
> 时间指导是**阶段估时**（"约 X 天"这一档），不是排到日历上；\`date\` 字段可选。
> 每段后面的**检验信号**是"能不能往下走"的判据，**题目/提问**是"怎么知道自己会不会"的手段。
> **配套资源**按**节点归属推导**：资源挂的节点与本段涉及的节点在同一条根→叶路径上即配套，
> 按三因子推荐排序 —— **没有审过资源内容**，不匹配时改 \`Resource.node\` 一个字段重跑即可。
> canvas 是方正表格：一行一段，三列 = 阶段 / 检验信号 / 验收题目（配套资源写在阶段卡里）。

![[学习路径.canvas]]

---

## 一、总览

| 段 | 阶段 | 估时 | 涉及节点 | 检验信号 | 验收题目 | 配套资源 |
|---|---|---|---|---|---|---|
${overview === '' ? '| — | （还没有排任何段） | — | — | — | — | — |' : overview}

---

## 二、逐段展开

${sections === '' ? '（还没有排任何段）' : sections}
---

## 三、进度清单

${checklist === '' ? '（还没有排任何段）' : checklist}

---

## 四、与知识地图的对照表

| 段 id | 段标题 | 涉及节点 |
|---|---|---|
${crossRef === '' ? '| — | （还没有排任何段） | — |' : crossRef}

> 上表里的节点 id 与 \`知识地图.md\` 的节点清单**同一批**（互为对照）；
> 反向查询"某个节点被哪几段覆盖"用 \`stagesOfNode()\`。
`
}
