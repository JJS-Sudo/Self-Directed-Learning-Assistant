import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMapTree, type MapTreeNode } from '../domain/graph.js'
import type { GoalSummary } from '../domain/goals.js'
import { listAllNodes, listNodes, type MapNodeSummary } from '../domain/nodes.js'
import { listStages } from '../domain/path-stages.js'
import { listAllResources } from '../domain/resources.js'
import { listAreaDocuments, partitionEntities, goalAreaRelativePath } from '../vault/goal-areas.js'
import { assertVaultUsable, resolveInsideVault } from '../vault/paths.js'
import { buildStageResources } from './stage-resources.js'
import {
  RELATION_COLORS,
  buildRadialCanvas,
  serializeCanvas,
  type Canvas,
  type CardColor,
  type MapCard,
} from './canvas.js'

/**
 * 知识地图生成器：读 `知识网/` 的实体 → 写 `知识地图.md` + `知识地图.canvas`。
 *
 * 形态（2026-10-08 第二版）：
 * - **径向蛛网**：锚点（目标）在中心，分支按角度散开、逐层向外
 * - **三种关系边**：上级（子 → 父）/ 并列（同级兄弟链）/ 相关（跨支），都带标签与固定颜色
 * - **下级不画边**：它就是上级的反向读法；画成第二条边既重叠又违反「同一事实只存一处」，
 *   改在图例卡里说明
 * - **覆盖检查**：报出"没有任何路径段覆盖的叶子节点"与"引用了已消失节点的路径段"
 */

export const GENERATED_NOTICE =
  '本文件由 `npm run maps` 生成，**手改会在下次重跑时被覆盖**。源实体在 `知识网/`。'

const BRANCH_COLORS: CardColor[] = ['4', '1', '2', '5', '3', '6']

export interface GeneratedArtifact {
  relativePath: string
  content: string
}

export interface CoverageReport {
  /** 没有任何路径段覆盖的**叶子**节点（地图拆了却没排进路径） */
  uncoveredLeaves: { id: string; title: string }[]
  /** 路径段引用、但地图上已不存在的节点 id */
  missingNodes: { id: string; stageTitle: string }[]
  /** 挂在本目标知识网里、但没有任何路径段用到的资源（凑了资源却没排进路径） */
  unusedResources: { id: string; title: string }[]
}

export interface KnowledgeMapResult {
  nodeCount: number
  skipped: string[]
  coverage: CoverageReport
  canvas: Canvas
  md: string
  artifacts: GeneratedArtifact[]
}

export function buildKnowledgeMap(root: string, goal: GoalSummary): KnowledgeMapResult {
  // 软删除语义：`status: 已归档` 的节点留在库里（链接不断），但不再进地图
  const nodes = listNodes(root, goal.id).filter((node) => node.status !== '已归档')
  const { skipped } = partitionEntities(listAreaDocuments(root, goal, '知识网'), 'map-node')
  const tree = buildMapTree(nodes)

  // ── 分支上色：每个顶层分支一个色（照工作区模板：按分支区分） ──
  const branchColor = new Map<string, CardColor>()
  tree.forEach((node, index) => {
    const color = BRANCH_COLORS[index % BRANCH_COLORS.length] ?? '4'
    for (const id of subtreeIds(node)) branchColor.set(id, color)
  })

  const anchor: MapCard = {
    key: `goal:${goal.id}`,
    title: goal.title,
    detail: [
      `类型：${goal.kind}`,
      ...(goal.deadline === undefined
        ? []
        : [`期限：${goal.deadline}（还剩 ${goal.daysLeft ?? '?'} 天）`]),
      `节点：${nodes.length} 个`,
    ].join('\n'),
    color: '6',
    children: tree.map((node) => nodeCard(node, branchColor)),
  }

  // ── 径向：锚点在中心 ──
  const { canvas, cardIds } = buildRadialCanvas([anchor], { radiusStep: 460, width: 260 })

  // ── 并列边：同一 up 下按 order 相邻的兄弟链式相连 ──
  for (const group of siblingGroups(nodes)) {
    for (let index = 1; index < group.length; index += 1) {
      const from = cardIds.get(group[index - 1]?.id ?? '')
      const to = cardIds.get(group[index]?.id ?? '')
      if (from === undefined || to === undefined) continue
      canvas.edges.push({
        id: `p${canvas.edges.length + 1}`,
        fromNode: from,
        toNode: to,
        label: '并列',
        color: RELATION_COLORS.并列,
      })
    }
  }

  // ── 相关边：只画源节点声明的那些 ──
  for (const node of nodes) {
    for (const relatedId of node.relatedIds) {
      const from = cardIds.get(node.id)
      const to = cardIds.get(relatedId)
      if (from === undefined || to === undefined) continue
      canvas.edges.push({
        id: `r${canvas.edges.length + 1}`,
        fromNode: from,
        toNode: to,
        label: '相关',
        color: RELATION_COLORS.相关,
      })
    }
  }

  // ── 通知卡与图例卡：放在整张网的左上方，不参与径向布局 ──
  const minY = canvas.nodes.reduce((min, node) => Math.min(min, node.y), 0)
  canvas.nodes.unshift({
    id: 'notice',
    type: 'text',
    text: '**本图由 npm run maps 生成**\n' + '源实体在 `知识网/`；手改这张图会在下次重跑时被覆盖。',
    x: -900,
    y: minY - 300,
    width: 460,
    height: 96,
  })
  canvas.nodes.unshift({
    id: 'legend',
    type: 'text',
    text:
      '**四种关系怎么看**\n' +
      '· **上级**（绿）：子 → 父，与 frontmatter 的 `up` 同向\n' +
      '· **下级**：**上级的反向推导**，不单独画边 —— 同一事实只存一处\n' +
      '· **并列**（黄）：同一上级下按 `order` 相邻的兄弟\n' +
      '· **相关**（橙）：跨枝干的邻接概念，只写在源节点正文',
    x: -900,
    y: minY - 170,
    width: 460,
    height: 170,
  })

  const coverage = checkCoverage(root, goal, nodes)
  const md = renderKnowledgeMapMd(goal, nodes, tree, skipped, coverage)

  return {
    nodeCount: nodes.length,
    skipped: skipped.map((doc) => doc.relativePath),
    coverage,
    canvas,
    md,
    artifacts: [
      {
        relativePath: join(goalAreaRelativePath(goal), '知识地图.canvas'),
        content: serializeCanvas(canvas),
      },
      { relativePath: join(goalAreaRelativePath(goal), '知识地图.md'), content: md },
    ],
  }
}

/** 生成并落盘（幂等：同一实体数据必然得到同一份字节） */
export function writeKnowledgeMap(rootInput: string, goal: GoalSummary): KnowledgeMapResult {
  const root = assertVaultUsable(rootInput)
  const result = buildKnowledgeMap(root, goal)
  for (const artifact of result.artifacts) {
    writeFileSync(resolveInsideVault(root, artifact.relativePath), artifact.content, 'utf8')
  }
  return result
}

/** 覆盖检查：地图、路径与资源三方有没有脱节 */
export function checkCoverage(
  root: string,
  goal: GoalSummary,
  nodes: MapNodeSummary[],
): CoverageReport {
  const stages = listStages(root, goal.id)
  const covered = new Set(stages.flatMap((stage) => stage.nodeIds))
  const ids = new Set(nodes.map((node) => node.id))

  const hasChild = new Set(
    nodes.map((node) => node.upId).filter((id): id is string => id !== undefined),
  )
  const uncoveredLeaves = nodes
    .filter((node) => !hasChild.has(node.id) && !covered.has(node.id))
    .map((node) => ({ id: node.id, title: node.title }))

  const missingNodes: { id: string; stageTitle: string }[] = []
  for (const stage of stages) {
    for (const id of stage.nodeIds) {
      if (!ids.has(id)) missingNodes.push({ id, stageTitle: stage.title })
    }
  }

  // 资源侧：挂在本目标知识网里、但没有任何段用得上的资源
  const view = buildStageResources(root, goal)
  const used = new Set(stages.flatMap((stage) => view.ofStage(stage).map((item) => item.id)))
  const unusedResources = view.scoped
    .filter((resource) => !used.has(resource.id))
    .map((resource) => ({ id: resource.id, title: resource.title }))

  return { uncoveredLeaves, missingNodes, unusedResources }
}

/**
 * 跨库检查：**资源挂在不存在的节点上**（断链）。
 * 这类资源推不出归属目标，所以不在任何单个目标的覆盖检查里，只能在这一层报一次。
 */
export function checkDanglingResources(
  root: string,
): { id: string; title: string; nodeId: string }[] {
  const known = new Set(listAllNodes(root).map((node) => node.id))
  return listAllResources(root)
    .filter((resource) => resource.nodeId === undefined || !known.has(resource.nodeId))
    .map((resource) => ({
      id: resource.id,
      title: resource.title,
      nodeId: resource.nodeId ?? '（没有 node 字段）',
    }))
}

function subtreeIds(node: MapTreeNode): string[] {
  return [node.id, ...node.children.flatMap((child) => subtreeIds(child))]
}

/** 同一 `up` 下按 `order` 排序的兄弟组（`up` 为空的是顶层组） */
function siblingGroups(nodes: MapNodeSummary[]): MapNodeSummary[][] {
  const groups = new Map<string, MapNodeSummary[]>()
  for (const node of nodes) {
    const key = node.upId ?? '__top__'
    const bucket = groups.get(key)
    if (bucket === undefined) groups.set(key, [node])
    else bucket.push(node)
  }
  return [...groups.values()].map((group) =>
    [...group].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  )
}

function nodeCard(node: MapTreeNode, branchColor: Map<string, CardColor>): MapCard {
  const detail = [
    `序 ${node.order}`,
    node.mastery === '未学' ? '' : `掌握度：${node.mastery}`,
    node.related.length === 0 ? '' : `相关：${node.related.map((item) => item.title).join('、')}`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  return {
    key: node.id,
    title: node.title,
    ...(detail === '' ? {} : { detail }),
    color: branchColor.get(node.id) ?? '4',
    children: node.children.map((child) => nodeCard(child, branchColor)),
  }
}

export function renderKnowledgeMapMd(
  goal: GoalSummary,
  nodes: MapNodeSummary[],
  tree: MapTreeNode[],
  skipped: { relativePath: string }[],
  coverage: CoverageReport,
): string {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const titleOf = (id: string): string => byId.get(id)?.title ?? id

  const upRows = nodes
    .flatMap((node) =>
      node.upId === undefined ? [] : [`| ${node.title} \`${node.id}\` | ${titleOf(node.upId)} |`],
    )
    .join('\n')

  const downRows = nodes
    .map((node) => {
      const children = nodes.filter((item) => item.upId === node.id)
      return children.length === 0
        ? undefined
        : `| ${node.title} \`${node.id}\` | ${children.map((child) => `${child.title} \`${child.id}\``).join('、')} |`
    })
    .filter((row): row is string => row !== undefined)
    .join('\n')

  const siblingRows = siblingGroups(nodes)
    .map(
      (group) =>
        `| ${group[0]?.upId === undefined ? '(顶层)' : titleOf(group[0].upId)} | ${group
          .map((node) => `${node.order}. ${node.title} \`${node.id}\``)
          .join(' → ')} |`,
    )
    .join('\n')

  const relatedRows = nodes
    .flatMap((node) =>
      node.relatedIds.length === 0
        ? []
        : [
            `| ${node.title} \`${node.id}\` | ${node.relatedIds.map((id) => `${titleOf(id)} \`${id}\``).join('、')} |`,
          ],
    )
    .join('\n')

  const inventory = nodes
    .map(
      (node) =>
        `| \`${node.id}\` | ${node.title} | ${node.order} | ${node.mastery} | ${
          node.upId === undefined ? '(顶层)' : titleOf(node.upId)
        } |`,
    )
    .join('\n')

  const uncovered =
    coverage.uncoveredLeaves.length === 0
      ? '（没有）'
      : coverage.uncoveredLeaves.map((item) => `- \`${item.id}\` ${item.title}`).join('\n')
  const missing =
    coverage.missingNodes.length === 0
      ? '（没有）'
      : coverage.missingNodes
          .map((item) => `- \`${item.id}\`（来自路径段「${item.stageTitle}」）`)
          .join('\n')
  const unused =
    coverage.unusedResources.length === 0
      ? '（没有）'
      : coverage.unusedResources.map((item) => `- \`${item.id}\` ${item.title}`).join('\n')

  const skippedSection =
    skipped.length === 0
      ? ''
      : `\n## 七、被隔离的文件\n\n生成时跳过了 ${skipped.length} 个没有 \`id\`/\`type\` 的文件（本项目的 frontmatter 所有权条款：不参与索引）：\n\n${skipped
          .map((doc) => `- \`${doc.relativePath}\``)
          .join('\n')}\n`

  return `# ${goal.title} · 知识地图

> ${GENERATED_NOTICE}
> 形态：**径向蛛网** —— 目标在中心，分支按角度散开、逐层向外；
> 关系边：**上级**（绿，子 → 父）/ **并列**（黄，同级兄弟）/ **相关**（橙，跨枝干）。
> **下级不画边**：它是上级的反向推导（同一事实只存一处），见文末图例说明。
> 方法论出自工作区《知识地图.txt》：把学习理解为"获取概念之间的联系"。

![[知识地图.canvas]]

---

## 一、上级（由子指向父）

| 子节点 | 上级 |
|---|---|
${upRows === '' ? '| （全是顶层节点） | — |' : upRows}

## 二、下级（反向推导，不重复存储）

| 节点 | 下级 |
|---|---|
${downRows === '' ? '| （还没有下级） | — |' : downRows}

## 三、并列（同一上级下按 order 的顺序）

| 上级 | 并列节点（按序） |
|---|---|
${siblingRows === '' ? '| — | — |' : siblingRows}

## 四、相关（写在源节点正文双链，只存一处）

| 源节点 | 相关节点 |
|---|---|
${relatedRows === '' ? '| （还没有相关关系） | — |' : relatedRows}

## 五、节点清单（含 id）

| id | 标题 | order | 掌握度 | 上级 |
|---|---|---|---|---|
${inventory === '' ? '| — | （还没有节点） | — | — | — |' : inventory}

## 六、覆盖检查

生成时检查"地图拆了却没排进路径"的脱节。两类都为空才算地图与路径对齐。

**没有任何路径段覆盖的叶子节点**（拆到了叶子，却没给它排学习路径）：

${uncovered}

**路径段引用了、但地图上已不存在的节点**：

${missing}

**没有任何路径段用到的资源**（凑了资源却没排进路径）：

${unused}

---

## 图例：四种关系怎么看

| 关系 | 图上表现 | 数据来源 |
|---|---|---|
| **上级** | 绿色边，**子 → 父** | frontmatter 的 \`up\`（由子指向父） |
| **下级** | **不单独画边** | 由"哪些节点的 \`up\` 指向本节点"**反向推导** —— 同一事实只存一处 |
| **并列** | 黄色边，同级兄弟链式相连 | 同一 \`up\` 下按 \`order\` 排序后的相邻关系 |
| **相关** | 橙色边，跨枝干 | 源节点**正文受管区块**里的双链（只写一处） |

---

## 全景结构

\`\`\`text
${renderAsciiTree(tree)}
\`\`\`

---

## 使用建议

1. **先锚定，再展开**：新学的概念先接到某个已有节点上（补一条上级或相关），别让它变成孤岛。
2. **拆不动就转移**：下级拆到"再往下没有意义"时，切到并列（换做法）或相关（换学科）。
3. **一个可验概念一张卡**：这张卡的内容能不能被**一条检验信号**验完？不能就继续拆。
4. **看覆盖检查**：叶子没被任何路径段覆盖，说明地图拆了却没排进路径 —— 补一段或合并这个叶子。
5. **回写掌握度**：复盘时把节点掌握度改成 未学 / 在学 / 已掌握，地图会跟着变。

> 学习路径见同目录的 \`学习路径.md\`（每段都列出了它涉及哪些节点，与本文互为对照）。
${skippedSection}`
}

export function renderAsciiTree(tree: MapTreeNode[]): string {
  const lines: string[] = []
  const walk = (nodes: MapTreeNode[], prefix: string): void => {
    nodes.forEach((node, index) => {
      const last = index === nodes.length - 1
      const mark = last ? '└─ ' : '├─ '
      const suffix = node.mastery === '未学' ? '' : `  [${node.mastery}]`
      lines.push(`${prefix}${mark}${node.title} \`${node.id}\`${suffix}`)
      walk(node.children, `${prefix}${last ? '   ' : '│  '}`)
    })
  }
  walk(tree, '')
  return lines.length === 0 ? '(还没有节点)' : lines.join('\n')
}
