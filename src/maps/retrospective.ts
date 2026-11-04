import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listAssessmentsOfGoal, type AssessmentSummary } from '../domain/assessments.js'
import type { GoalSummary } from '../domain/goals.js'
import { listStages, type PathStageSummary } from '../domain/path-stages.js'
import { listRetrospectives, type RetrospectiveSummary } from '../domain/retrospectives.js'
import { goalAreaRelativePath } from '../vault/goal-areas.js'
import { wikilink } from '../vault/document.js'
import { assertVaultUsable, resolveInsideVault } from '../vault/paths.js'
import { buildTreeCanvas, serializeCanvas, type Canvas, type MapCard } from './canvas.js'
import { GENERATED_NOTICE, type GeneratedArtifact } from './knowledge-map.js'

/**
 * 复盘生成器：读 `复盘/` 的实体（＋它关联的验收与路径调整）
 * → 写 `复盘.md` + `复盘.canvas`（思维导图：一条复盘一支，多条按日期并列）。
 */

export interface RetrospectiveMapResult {
  retrospectiveCount: number
  canvas: Canvas
  md: string
  artifacts: GeneratedArtifact[]
}

export function buildRetrospectiveMap(root: string, goal: GoalSummary): RetrospectiveMapResult {
  const retrospectives = listRetrospectives(root, { goalId: goal.id })
  const assessments = new Map(
    listAssessmentsOfGoal(root, goal).map((item) => [item.id, item] as const),
  )
  const stages = new Map(listStages(root, goal.id).map((stage) => [stage.id, stage] as const))

  const branches: MapCard[] = retrospectives.map((item) => {
    const assessment =
      item.assessmentId === undefined ? undefined : assessments.get(item.assessmentId)
    const stageTitles =
      item.adjustEventIds.length === 0
        ? '（本次没有调整路径）'
        : item.adjustEventIds.map((id) => stages.get(id)?.title ?? id).join('\n')

    return {
      key: item.id,
      title: `${item.date} 复盘`,
      detail: `验收：${assessment?.title ?? '（缺失）'}`,
      color: '5',
      children: [
        { key: `${item.id}:worked`, title: '有效做法', detail: item.worked, color: '4' },
        { key: `${item.id}:failed`, title: '无效做法', detail: item.failed, color: '1' },
        { key: `${item.id}:next`, title: '下一步调整', detail: item.nextAdjustment, color: '2' },
        {
          key: `${item.id}:adjust`,
          title: '调整了哪些路径段',
          detail: stageTitles,
          color: '3',
        },
        {
          key: `${item.id}:result`,
          title: '本次验收结果',
          detail:
            assessment === undefined
              ? '（验收记录缺失）'
              : `${assessment.mode}：${assessment.result}`,
          color: '6',
        },
      ],
    }
  })

  const rootCard: MapCard = {
    key: `goal:${goal.id}`,
    title: `复盘 · ${goal.title}`,
    detail: `${retrospectives.length} 条复盘`,
    color: '6',
    children: branches,
  }

  const { canvas } = buildTreeCanvas([rootCard], { colWidth: 400 })
  const minY = canvas.nodes.reduce((min, node) => Math.min(min, node.y), 0)
  canvas.nodes.unshift({
    id: 'notice',
    type: 'text',
    text:
      '**本图由 npm run maps 生成**\n' +
      '一条复盘一支：三字段 + 路径调整 + 本次验收结果。手改会被下次重跑覆盖。',
    x: 0,
    y: minY - 150,
    width: 460,
    height: 96,
  })

  return {
    retrospectiveCount: retrospectives.length,
    canvas,
    md: renderRetrospectiveMd(goal, retrospectives, assessments, stages),
    artifacts: [
      {
        relativePath: join(goalAreaRelativePath(goal), '复盘.canvas'),
        content: serializeCanvas(canvas),
      },
      {
        relativePath: join(goalAreaRelativePath(goal), '复盘.md'),
        content: renderRetrospectiveMd(goal, retrospectives, assessments, stages),
      },
    ],
  }
}

export function writeRetrospectiveMap(
  rootInput: string,
  goal: GoalSummary,
): RetrospectiveMapResult {
  const root = assertVaultUsable(rootInput)
  const result = buildRetrospectiveMap(root, goal)
  for (const artifact of result.artifacts) {
    writeFileSync(resolveInsideVault(root, artifact.relativePath), artifact.content, 'utf8')
  }
  return result
}

/** 段链接：走 `wikilink()` 清洗标题里的 `|` `[` `]`，否则 Obsidian 解析不了 */
function linkToStage(stage: PathStageSummary | undefined, fallbackId: string): string {
  return stage === undefined ? `[[${fallbackId}]]` : wikilink(stage.id, stage.title)
}

export function renderRetrospectiveMd(
  goal: GoalSummary,
  retrospectives: RetrospectiveSummary[],
  assessments: Map<string, AssessmentSummary>,
  stages: Map<string, PathStageSummary>,
): string {
  const sections = retrospectives
    .map((item) => {
      const assessment =
        item.assessmentId === undefined ? undefined : assessments.get(item.assessmentId)
      const adjust =
        item.adjustEventIds.length === 0
          ? '（本次没有调整路径）'
          : item.adjustEventIds.map((id) => linkToStage(stages.get(id), id)).join('、')

      return `### ${item.date} · ${item.title}

- **关联验收**：${assessment === undefined ? '（缺失）' : `${wikilink(assessment.id, assessment.title)}（${assessment.mode}：${assessment.result}）`}
- **有效做法**：${item.worked}
- **无效做法**：${item.failed}
- **下一步调整**：${item.nextAdjustment}
- **调整的路径段**：${adjust}
`
    })
    .join('\n')

  return `# ${goal.title} · 复盘

> ${GENERATED_NOTICE}
> 复盘的思维导图见 \`复盘.canvas\`；一条复盘一支，多条按日期并列。

![[复盘.canvas]]

---

## 一、逐条复盘

${sections === '' ? '（还没有复盘）' : sections}

---

## 二、怎么读这张图

- **有效做法 / 无效做法 / 下一步调整** 是复盘的三字段，缺一条这条复盘就没写完。
- **调整了哪些路径段** 指向 \`学习路径/\` 里的段 —— 复盘要能落到"下一轮改哪一段"，
  否则只是感想。
- **本次验收结果** 来自 \`验收/\` 里的验收记录（复述 / 做题）。
`
}
